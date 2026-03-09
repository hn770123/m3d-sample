/**
 * @file main.js
 * @description 3Dレンダリングのメインスクリプト。Three.jsを利用してiPhoneのSafariなどのモバイルブラウザ上で、
 *              裸眼立体視（平行法）ができるように画面を左右に分割してキューブを描画します。
 *              また、タッチ操作によってキューブの回転速度やカメラとキューブとの距離を変更できます。
 */

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

// タッチインタラクション用の変数
let rotationSpeedX = 0.005; // X軸の回転速度
let rotationSpeedY = 0.01;  // Y軸の回転速度
let cameraDistance = 4;     // カメラからキューブまでの距離(Z軸)
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

    // 5. リサイズイベントとタッチイベントの登録
    window.addEventListener('resize', onWindowResize);

    // ポインターイベントの登録 (iOS Safari等のマルチデバイス対応のため PointerEvent を使用)
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none'; // ブラウザのデフォルトのタッチ操作（スクロールやズーム）を無効化
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
    // ポインターキャプチャを設定し、要素外へ出てもイベントを追跡できるようにする
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

    // X軸方向の移動量 (右スワイプでプラス、左スワイプでマイナス)
    const deltaX = touchCurrentX - touchStartX;
    // Y軸方向の移動量 (下スワイプでプラス、上スワイプでマイナス)
    const deltaY = touchCurrentY - touchStartY;

    // 1. 左右のスワイプによる回転速度の変更
    // 感度調整係数
    const sensitivityX = 0.0001;

    // 右にスワイプ(deltaX > 0)すると速度が上がり、左にスワイプ(deltaX < 0)すると速度が下がる
    rotationSpeedX += deltaX * sensitivityX;
    rotationSpeedY += (deltaX * sensitivityX * 2); // Y軸の初期値が2倍だったのでそれに合わせる

    // 左スワイプで速度がマイナスにならないよう、下限を0に設定
    if (rotationSpeedX < 0) rotationSpeedX = 0;
    if (rotationSpeedY < 0) rotationSpeedY = 0;

    // 2. 上下のスワイプによるカメラ距離の変更
    // 感度調整係数
    const sensitivityY = 0.01;

    // 上スワイプ(deltaY < 0)で遠ざかる(Z距離が増加)、下スワイプ(deltaY > 0)で近づく(Z距離が減少)
    // ユーザーから見て、上にスワイプすると奥に行くイメージなので、deltaYをマイナスすることで実現する
    cameraDistance -= deltaY * sensitivityY;

    // 限界値は設けないが、Z軸距離がマイナスになると裏側に回ってしまうため、十分小さな値を下限とする
    if (cameraDistance < 0.1) cameraDistance = 0.1;

    cameraLeft.position.z = cameraDistance;
    cameraRight.position.z = cameraDistance;

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
 * アニメーションループ
 * 毎フレームごとにキューブの回転状態を更新し、レンダリング処理を呼び出します。
 */
function animate() {
    requestAnimationFrame(animate);

    // 変数で管理している速度でキューブを回転させる
    cube.rotation.x += rotationSpeedX;
    cube.rotation.y += rotationSpeedY;

    render();
}

/**
 * 画面を左右に分割してレンダリングする処理
 * シザーテスト(ScissorTest)とビューポート(Viewport)を利用して、画面の左半分と右半分に
 * それぞれ別のカメラからの映像を描画します。
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
