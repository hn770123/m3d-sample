# フリー素材（外部3Dモデル）の描画とキューブのアニメーション同期の実装検討

本ドキュメントでは、既存のワイヤーフレームキューブを外部の3Dモデル（フリー素材）に置き換え、現在のキューブと同じ動き（回転およびZ軸の往復運動）をさせるための実装方針を検討します。

## 1. 要件の整理

1.  **外部3Dモデルの読み込み**: `.gltf` または `.glb` 形式の外部3Dモデルデータを読み込んで表示する。
2.  **キューブとの置き換え**: 現在描画されているキューブを削除し、読み込んだ3Dモデルを配置する。
3.  **アニメーションの同期**: 既存のキューブが行っているX軸・Y軸の回転、およびZ軸の往復運動を、置き換えた3Dモデルに適用する。
4.  **既存機能への影響**:
    *   **明/暗モード切り替え**: モードに応じて3Dモデルの見た目（マテリアル等）を変更するか、別のモデルを読み込む必要がある。
    *   **サイズ変更（大/小）**: `currentCubeSize` の変更に合わせて、3Dモデルのスケール（大きさ）を変更する必要がある。

## 2. 実装方針

### 2.1. 3Dモデルローダーの導入
Three.jsで外部3Dモデルを読み込むために、`GLTFLoader` を使用します。`index.html` のインポートマップにはすでに `three/addons/` のパスが設定されているため、`main.js` で以下のようにインポートできます。

```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
```

### 2.2. モデルの読み込みと配置
`GLTFLoader` を使用してモデルを非同期で読み込みます。読み込み完了後、既存の `cube` 変数に読み込んだモデル（`gltf.scene`）を代入することで、既存のアニメーションロジック（`animate` 関数内）をそのまま活かすことができます。

```javascript
const loader = new GLTFLoader();
// 例として 'model.glb' を読み込む
loader.load('model.glb', (gltf) => {
    const model = gltf.scene;
    // 既存のキューブを削除
    removeCube();

    // グローバル変数 cube を置き換える
    cube = model;

    // 初期位置の設定
    cube.position.z = 1;

    // モデルのサイズ調整（スケール）
    const scale = currentCubeSize / 2; // 元のサイズに対する比率など調整が必要
    cube.scale.set(scale, scale, scale);

    // 影の設定（モデル内の全てのMeshに対して適用）
    cube.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // 明暗モードに応じたマテリアルの調整もここで行う
        }
    });

    scene.add(cube);
}, undefined, (error) => {
    console.error('An error happened while loading the model:', error);
});
```

### 2.3. 既存の `createDarkCube` / `createLightCube` の改修
現在、モード切り替え時やサイズ変更時には `updateSceneMode()` が呼ばれ、内部で `createDarkCube()` または `createLightCube()` が実行され、キューブを最初から作り直しています。
3Dモデルに置き換える場合、**都度モデルファイルを読み込み直すのは非効率**であるため、以下のいずれかのアプローチを取る必要があります。

**アプローチA：初期化時に一度だけ読み込み、表示状態やスケールを切り替える（推奨）**
1.  `init()` のタイミングでモデルを読み込み、シーンに追加しておく。
2.  `updateSceneMode()` ではモデルの再生成を行わず、以下のみを実行する。
    *   `cube.scale.set(currentCubeSize, currentCubeSize, currentCubeSize)` でサイズを更新。
    *   明/暗モードに応じて、モデル内の `child.material` を差し替える（例：暗モード時はワイヤーフレームマテリアル、明モード時は標準マテリアル）。

**アプローチB：モードごとに別のモデルファイルを用意して切り替える**
明モード用、暗モード用に別々のモデル（`light_model.glb`, `dark_model.glb`）を用意する場合。
`createDarkCube` / `createLightCube` の中でそれぞれの `loader.load()` を実行します（読み込み完了まで画面から消える時間が発生するため、ローディング表示などの工夫が必要になります）。

### 2.4. アニメーション処理への影響
既存の `animate()` 関数は以下のようになっています。

```javascript
function animate() {
    requestAnimationFrame(animate);

    if (cube) {
        // X軸・Y軸の回転
        cube.rotation.x += rotationSpeedX;
        cube.rotation.y += rotationSpeedY;

        // Z軸の往復運動
        cube.position.z = 1 + Math.sin(cube.rotation.x) * 1.0;
    }

    render();
}
```

`cube` 変数に読み込んだ3Dモデル（`THREE.Group` または `THREE.Mesh`）が代入されていれば、この `animate` 関数のロジックは一切変更せずに、モデル全体を回転・往復運動させることができます。

## 3. 実装のステップ（まとめ）

1.  **アセットの準備**: 使用する3Dモデルファイル（例: `model.glb`）をプロジェクトディレクトリに配置する。
2.  **インポートの追加**: `main.js` に `GLTFLoader` のインポートを追加する。
3.  **ローダーの初期化**: グローバルまたは `init` 内で `new GLTFLoader()` を準備する。
4.  **キューブ生成関数の置き換え**:
    *   既存の `createLightCube(size)` / `createDarkCube(size)` の処理を、`GLTFLoader.load()` を用いた処理に変更する。
    *   読み込み完了時のコールバック内で、モデルのスケールを `size` に応じて調整し、`cube` 変数に代入して `scene.add()` する。
    *   モデルの各メッシュ (`child.isMesh`) に対して、`castShadow = true` / `receiveShadow = true` を設定し、モードに応じたマテリアルを適用する。
5.  **非同期読み込みへの対応**:
    *   モデルの読み込みは非同期で行われるため、`animate` 関数内で `if (cube)` のチェックが機能しているか確認する（既に実装済みのため問題なし）。

## 4. 懸念点と留意事項

*   **モデルの原点とサイズ**: 読み込む3Dモデルの原点（Pivot）が中心にない場合や、初期サイズが巨大（または極小）な場合、回転軸がずれたり画面からはみ出したりする可能性があります。読み込み後に `THREE.Box3` などを使ってモデルのバウンディングボックスを計算し、中心座標やスケールを正規化する処理を入れると、様々なフリー素材に対応しやすくなります。
*   **マテリアルの互換性**: 外部モデルに初めから設定されているマテリアル（PBRマテリアルなど）を、暗モードでワイヤーフレームとして綺麗に表示するには、マテリアルの再帰的な張り替え処理（`traverse`）を正しく実装する必要があります。

## 5. インターネットから直接3Dモデルをダウンロードして表示する方法の検討

ローカルに配置したファイルではなく、インターネット上の任意のURL（外部サーバー）から直接3Dモデルをダウンロードして実行時に表示する場合の実装方針と課題についてリサーチしました。特に iPhone の Safari (WebGL) で動かすことを前提としています。

### 5.1. 推奨されるモデル形式とアプローチ
iPhoneのSafariなど、モバイル環境のブラウザで動的に3Dモデルを読み込む場合、形式は圧倒的に **glTF / GLB 形式** が推奨されます。
*   **GLBの優位性**: ジオメトリ、マテリアル、テクスチャが1つのバイナリファイルにまとまっているため、外部URLから読み込む際のHTTPリクエスト数を最小限に抑えられ、パース速度も高速です。
*   **他形式（OBJなど）の非推奨理由**: OBJ形式などはマテリアル（MTL）やテクスチャファイルが別々に存在することが多く、外部URLから相対パスでこれらを正しく解決して読み込むのは、CORS制限などの影響を受けやすく実装が非常に複雑になります。

### 5.2. 技術的な課題と壁

外部URLから直接モデルを読み込む場合の最大の障壁は、以下の2点です。

#### 1. CORS (Cross-Origin Resource Sharing) 制限
JavaScript (Three.js) が、アプリがホストされているドメインとは異なる別のドメインからファイル（3Dモデルデータ）を `fetch` や `XMLHttpRequest` で取得しようとすると、ブラウザのセキュリティ機構によりブロックされます。
*   **エラーの例**: `Access to fetch at 'https://example.com/model.glb' from origin 'http://localhost:8000' has been blocked by CORS policy`
*   配布元のサーバーが明示的に `Access-Control-Allow-Origin: *` といったCORSヘッダーを返さない限り、ブラウザ側でモデルを読み込むことは不可能です。

#### 2. iOS Safari特有のメモリ制限
iPhoneのSafariは、PCのブラウザに比べてWebGLやタブごとのメモリ使用量に厳格な制限があります。
*   外部から巨大なモデル（高解像度テクスチャを含むものなど）を動的にダウンロードすると、Safariがクラッシュしたり、WebGLコンテキストが失われる（Context Lost）リスクが高まります。
*   **対策**: 読み込むモデルはモバイル向けに最適化されている（ポリゴン数が少ない、テクスチャが圧縮されている）必要があります。

### 5.3. CORS問題の解決策

外部URLから直接モデルを表示するためには、CORS制限を突破する必要があります。以下のいずれかのアプローチが必要です。

1.  **CORSが許可されているURLを使用する**
    *   外部リソースの提供元が意図的にCORSを許可している場合（一部のパブリックAPIや、特定のCDNなど）は、そのまま読み込むことができます。
    *   例: 自身のGitHub PagesやS3バケットなどであれば、設定でCORSを許可できます。
2.  **CORSプロキシサーバーを経由する**
    *   フロントエンドから直接外部URLを叩くのではなく、自身で管理するサーバー（またはパブリックなCORSプロキシサービス）を経由してデータを取得します。
    *   フロー: `Three.js` -> `CORS Proxy (自身のドメイン)` -> `外部のモデルURL`
    *   *注意*: パブリックなCORSプロキシ（例: `cors-anywhere.herokuapp.com`）は一時的なテスト目的には使えますが、本番運用には向いていません（帯域制限や安定性の問題）。

### 5.4. 具体的なコード例（CORSプロキシを利用した例）

`GLTFLoader` を使用して、外部URLから直接モデルを読み込む例です。CORS問題を回避するため、プロキシURLを前置する想定のコードです。

```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 外部モデルのURL
const externalModelUrl = 'https://example-domain.com/path/to/free-model.glb';
// CORSプロキシ（テスト用の場合）
const corsProxy = 'https://cors-anywhere.herokuapp.com/';

// 実際にフェッチするURL
const fetchUrl = corsProxy + externalModelUrl;

const loader = new GLTFLoader();

// クロスドメインのテクスチャ読み込みを許可するためのおまじない（glTFでは通常自動設定されます）
loader.setCrossOrigin('anonymous');

loader.load(
    fetchUrl,
    (gltf) => {
        const model = gltf.scene;

        // 既存のキューブを削除して置き換える処理（2.2章と同様）
        if (cube) scene.remove(cube);
        cube = model;

        // スケールや位置の調整、マテリアルの適用など...
        cube.scale.set(1, 1, 1);
        scene.add(cube);

        console.log('外部モデルの読み込みに成功しました');
    },
    // 読み込み進捗
    (xhr) => {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    // エラーハンドリング（CORSエラーや404エラーなど）
    (error) => {
        console.error('外部モデルの読み込みに失敗しました:', error);
        alert('モデルを読み込めませんでした。CORS制限またはURLが無効の可能性があります。');
    }
);
```

### 5.5. 結論と推奨事項

iPhoneのSafari（モバイルWebGL環境）で外部の3Dモデルを直接URLから読み込んで表示することは技術的には可能（GLB形式推奨）ですが、**CORS制限のコントロールが最大の課題**となります。

*   任意のインターネット上のURLを入力して表示するような機能を実装する場合、ユーザーが入力したURLがCORSに対応していないケースが多発するため、自前のバックエンド（プロキシサーバー）を用意してそこで一度モデルをダウンロード・中継する仕組みがほぼ必須となります。
*   また、モバイル環境への配慮として、読み込み中のローディングUIの実装や、巨大なモデルが読み込まれた際のエラーハンドリング（WebGLクラッシュ対策）を厚く実装する必要があります。
