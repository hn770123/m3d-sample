/**
 * @file main.js
 * @description 3Dレンダリングのメインスクリプト。Three.jsを利用してiPhoneのSafariなどのモバイルブラウザ上で、
 *              裸眼立体視（平行法）ができるように画面を左右に分割してキューブを描画します。
 *              また、タッチ操作によってキューブの回転速度やキューブのサイズを変更できます。
 */

import * as THREE from 'three';

// 画面分割による平行法の立体視を行うためのパラメータ (1ユニット = 1cm)
// iPhone 15 Plus 画面幅: 約7.2cm
// 画面幅の半分: 3.6cm
// 画面までの距離: 20cm
// 視野角(FOV): 画面幅の半分(3.6cm)と距離(20cm)から計算
const screenWidth = 7.2;
const halfScreenWidth = screenWidth / 2;
const cameraDistance = 20;

// FOV = 2 * arctan((画面高/2) / 距離)
// ただしアスペクト比(縦横比)を元にThree.jsは縦方向のFOVを要求するため、
// ここではiPhoneの縦画面(または横画面)を考慮する必要があるが、
// モバイル横持ち(平行法)を想定し、縦幅(height)に対してFOVを計算する。
// アスペクト比が横幅(3.6cm)/縦幅(h)とすると、縦方向のFOVは h/2 で計算する。
// 厳密な画面高(約16cm)の半分8cmで計算するか、とりあえず横幅3.6cmから横FOVを計算し、縦FOVに変換する。
// THREE.PerspectiveCamera の fov は「垂直視野角 (Vertical FOV)」である。
// カメラから画面(幅3.6cm)がぴったり収まるようにするには、
// 横FOV = 2 * atan((3.6 / 2) / 20)
// 縦FOV = 横FOV / aspect (近似)
// 簡単のため、横画面とみなして直接計算する。
const horizontalFOV = 2 * Math.atan((halfScreenWidth / 2) / cameraDistance) * (180 / Math.PI);

const params = {
    eyeSeparation: 6.4,  // 視差（瞳孔間距離） 6.4cm
    near: 0.1,           // ニアクリップ
    far: 100             // ファークリップ
};

// --- グローバル変数 ---
let scene, renderer;
let cameraLeft, cameraRight;
let cube;

// タッチインタラクション用の変数
let rotationSpeedX = 0.005; // X軸の回転速度
let rotationSpeedY = 0.01;  // Y軸の回転速度
let cubeScale = 1.0;        // キューブのサイズ(倍率)
let touchStartX = 0;        // タッチ開始時のX座標
let touchStartY = 0;        // タッチ開始時のY座標

init();
animate();

/**
 * Three.jsシーンの初期化処理
 * シーン、カメラ、レンダラー、3Dオブジェクトの作成、および各種イベントリスナーの登録を行います。
 */
function init() {
    // 1. Scene（シーン）の作成
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // 黒背景

    // 2. Renderer（レンダラー）の作成と設定
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio); // Retinaディスプレイ対応
    renderer.setSize(window.innerWidth, window.innerHeight);
    // シザーテストを有効化し、部分描画（Viewportの分割）を可能にする
    renderer.setScissorTest(true);
    document.body.appendChild(renderer.domElement);

    // 3. Camera（カメラ）の作成
    // アスペクト比は左右それぞれ画面の半分になるため、window.innerWidth / 2 で計算
    const aspect = (window.innerWidth / 2) / window.innerHeight;

    // 縦FOVの計算 (横FOVからアスペクト比を使って逆算)
    // tan(vFOV / 2) = tan(hFOV / 2) / aspect
    // vFOV = 2 * atan( tan(hFOV / 2) / aspect )
    const verticalFOV = 2 * Math.atan(Math.tan((horizontalFOV * Math.PI / 180) / 2) / aspect) * (180 / Math.PI);

    // 平行法（Parallel Viewing）かつ Toe-in 方式のためのカメラ設定
    cameraLeft = new THREE.PerspectiveCamera(verticalFOV, aspect, params.near, params.far);
    cameraLeft.position.z = cameraDistance;
    cameraLeft.position.x = -params.eyeSeparation / 2; // -3.2cm
    cameraLeft.lookAt(0, 0, 0); // 原点（画面中央）を凝視

    cameraRight = new THREE.PerspectiveCamera(verticalFOV, aspect, params.near, params.far);
    cameraRight.position.z = cameraDistance;
    cameraRight.position.x = params.eyeSeparation / 2; // 3.2cm
    cameraRight.lookAt(0, 0, 0); // 原点（画面中央）を凝視

    // 4. Object（キューブ）の作成
    // サイズを 3x3x3 (3cm角) とする
    const geometry = new THREE.BoxGeometry(3, 3, 3);

    // ワイヤーフレーム用のジオメトリに変換
    const edges = new THREE.EdgesGeometry(geometry);

    // 位置ごとに色を変えるための処理
    const colors = [];
    const positions = edges.attributes.position.array;

    // 頂点の座標(X,Y,Z)を正規化してRGBカラーにマッピング
    for (let i = 0; i < positions.length; i += 3) {
        // -1.5 ~ 1.5 の範囲を 0.0 ~ 1.0 に変換
        const r = (positions[i] / 3) + 0.5;
        const g = (positions[i+1] / 3) + 0.5;
        const b = (positions[i+2] / 3) + 0.5;
        colors.push(r, g, b);
    }

    // カラー属性をジオメトリに追加
    edges.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // vertexColors: true を指定してマテリアルを作成し、頂点カラーを反映させる
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2
    });

    cube = new THREE.LineSegments(edges, material);
    scene.add(cube);

    // 5. リサイズイベントとタッチイベントの登録
    window.addEventListener('resize', onWindowResize);

    // ポインターイベントの登録
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none'; // ブラウザのデフォルトのタッチ操作を無効化
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
}

// ポインター操作状態を管理するフラグ
let isPointerDown = false;

/**
 * ポインター操作開始時のイベントハンドラ
 * @param {PointerEvent} event - ポインターイベントオブジェクト
 */
function onPointerDown(event) {
    isPointerDown = true;
    touchStartX = event.clientX;
    touchStartY = event.clientY;
    event.target.setPointerCapture(event.pointerId);
}

/**
 * ポインター移動中のイベントハンドラ
 * @param {PointerEvent} event - ポインターイベントオブジェクト
 */
function onPointerMove(event) {
    if (!isPointerDown) return;

    // デフォルトのスクロール挙動（バウンスなど）を防止
    event.preventDefault();

    const touchCurrentX = event.clientX;
    const touchCurrentY = event.clientY;

    const deltaX = touchCurrentX - touchStartX;
    const deltaY = touchCurrentY - touchStartY;

    // 1. 左右のスワイプによる回転速度の変更
    const sensitivityX = 0.0001;
    rotationSpeedX += deltaX * sensitivityX;
    rotationSpeedY += (deltaX * sensitivityX * 2);

    if (rotationSpeedX < 0) rotationSpeedX = 0;
    if (rotationSpeedY < 0) rotationSpeedY = 0;

    // 2. 上下のスワイプによるキューブサイズの変更
    // 感度調整係数
    const sensitivityY = 0.01;

    // 上スワイプ(deltaY < 0)で拡大、下スワイプ(deltaY > 0)で縮小
    cubeScale -= deltaY * sensitivityY;

    // スケールに制限は設けないが、マイナス反転によるチラつき防止のため
    // 最低限の非常に小さなスケールは維持する（0未満を許容する場合はこれを外すが、
    // 完全に0になると見えなくなるため0.01を担保）
    if (cubeScale < 0.01) cubeScale = 0.01;

    cube.scale.set(cubeScale, cubeScale, cubeScale);

    // 次の移動差分を計算するために、現在の座標を保存
    touchStartX = touchCurrentX;
    touchStartY = touchCurrentY;
}

/**
 * ポインター操作終了・キャンセル時のイベントハンドラ
 * @param {PointerEvent} event - ポインターイベントオブジェクト
 */
function onPointerUp(event) {
    isPointerDown = false;
    event.target.releasePointerCapture(event.pointerId);
}

/**
 * ウィンドウサイズ変更時のイベントハンドラ
 * 画面分割のアスペクト比を再計算し、カメラとレンダラーを更新します。
 */
function onWindowResize() {
    const aspect = (window.innerWidth / 2) / window.innerHeight;

    // 縦FOVの再計算
    const verticalFOV = 2 * Math.atan(Math.tan((horizontalFOV * Math.PI / 180) / 2) / aspect) * (180 / Math.PI);

    cameraLeft.fov = verticalFOV;
    cameraLeft.aspect = aspect;
    cameraLeft.updateProjectionMatrix();

    cameraRight.fov = verticalFOV;
    cameraRight.aspect = aspect;
    cameraRight.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * アニメーションループ
 * 毎フレームごとにキューブの回転状態を更新し、レンダリング処理を呼び出します。
 */
function animate() {
    requestAnimationFrame(animate);

    cube.rotation.x += rotationSpeedX;
    cube.rotation.y += rotationSpeedY;

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
    renderer.setViewport(0, 0, halfWidth, height);
    renderer.setScissor(0, 0, halfWidth, height);
    renderer.render(scene, cameraLeft);

    // --- 右画面（Right Camera）のレンダリング ---
    renderer.setViewport(halfWidth, 0, halfWidth, height);
    renderer.setScissor(halfWidth, 0, halfWidth, height);
    renderer.render(scene, cameraRight);
}
