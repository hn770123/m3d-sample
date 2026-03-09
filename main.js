import * as THREE from 'three';

// 画面分割による平行法の立体視を行うためのパラメータ
const params = {
    eyeSeparation: 0.05, // 視差（眼の距離オフセット）
    fov: 50,             // 視野角
    near: 0.1,           // ニアクリップ
    far: 10              // ファークリップ
};

// --- グローバル変数 ---
let scene, renderer;
let cameraLeft, cameraRight;
let cube;

init();
animate();

/**
 * 初期化処理
 */
function init() {
    // 1. Scene（シーン）の作成
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // 黒背景

    // 2. Renderer（レンダラー）の作成と設定
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio); // Retinaディスプレイ対応
    renderer.setSize(window.innerWidth, window.innerHeight);
    // スハサテストを有効化し、部分描画（Viewportの分割）を可能にする
    renderer.setScissorTest(true);
    document.body.appendChild(renderer.domElement);

    // 3. Camera（カメラ）の作成
    // アスペクト比は左右それぞれ画面の半分になるため、window.innerWidth / 2 で計算
    const aspect = (window.innerWidth / 2) / window.innerHeight;

    // 平行法（Parallel Viewing）のためのカメラ設定
    // 左右にわずかにオフセットを持たせる
    cameraLeft = new THREE.PerspectiveCamera(params.fov, aspect, params.near, params.far);
    cameraLeft.position.z = 4; // キューブ全体が見えるように少し離す
    // 左目のカメラは少し左へ
    cameraLeft.position.x = -params.eyeSeparation / 2;

    cameraRight = new THREE.PerspectiveCamera(params.fov, aspect, params.near, params.far);
    cameraRight.position.z = 4; // キューブ全体が見えるように少し離す
    // 右目のカメラは少し右へ
    cameraRight.position.x = params.eyeSeparation / 2;

    // 4. Object（キューブ）の作成
    // サイズを 1x1x1 とする
    const geometry = new THREE.BoxGeometry(1, 1, 1);

    // ワイヤーフレーム用のジオメトリに変換
    const edges = new THREE.EdgesGeometry(geometry);

    // 位置ごとに色を変えるための処理
    // LineSegmentsの場合、頂点ごとに色を指定できる
    const colors = [];
    const positions = edges.attributes.position.array;

    // 頂点の座標(X,Y,Z)を正規化してRGBカラーにマッピング
    for (let i = 0; i < positions.length; i += 3) {
        // -0.5 ~ 0.5 の範囲を 0.0 ~ 1.0 に変換
        const r = positions[i] + 0.5;
        const g = positions[i+1] + 0.5;
        const b = positions[i+2] + 0.5;
        colors.push(r, g, b);
    }

    // カラー属性をジオメトリに追加
    edges.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // vertexColors: true を指定してマテリアルを作成し、頂点カラーを反映させる
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2 // 注意: WebGLの制限によりlinewidthは現在1以上で太くならないことが多い
    });

    cube = new THREE.LineSegments(edges, material);
    scene.add(cube);

    // 5. リサイズイベントの登録
    window.addEventListener('resize', onWindowResize);
}

/**
 * ウィンドウサイズ変更時の処理
 */
function onWindowResize() {
    // 画面の半分のサイズからアスペクト比を再計算
    const aspect = (window.innerWidth / 2) / window.innerHeight;

    cameraLeft.aspect = aspect;
    cameraLeft.updateProjectionMatrix();

    cameraRight.aspect = aspect;
    cameraRight.updateProjectionMatrix();

    // レンダラーのサイズを更新
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * アニメーションループ（毎フレームの描画処理）
 */
function animate() {
    requestAnimationFrame(animate);

    // キューブをゆっくり回転させる
    cube.rotation.x += 0.005;
    cube.rotation.y += 0.01;

    render();
}

/**
 * 画面を左右に分割してレンダリングする処理
 */
function render() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const halfWidth = width / 2;

    // --- 左画面（Left Camera）のレンダリング ---
    // 左半分にビューポートとシザーを設定 (x, y, width, height)
    renderer.setViewport(0, 0, halfWidth, height);
    renderer.setScissor(0, 0, halfWidth, height);
    renderer.render(scene, cameraLeft);

    // --- 右画面（Right Camera）のレンダリング ---
    // 右半分にビューポートとシザーを設定
    renderer.setViewport(halfWidth, 0, halfWidth, height);
    renderer.setScissor(halfWidth, 0, halfWidth, height);
    renderer.render(scene, cameraRight);
}
