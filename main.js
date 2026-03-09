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

// コントローラー用の変数
let rotationSpeedX = 0.005; // X軸の回転速度
let rotationSpeedY = 0.01;  // Y軸の回転速度
let currentCubeSize = 3.0;  // キューブの現在のサイズ(cm)

init();
setupControllers();
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
    createCube(currentCubeSize);

    // 5. リサイズイベントの登録
    window.addEventListener('resize', onWindowResize);
}

/**
 * 指定したサイズでキューブを再生成する処理
 * @param {number} size - キューブの1辺のサイズ（cm）
 */
function createCube(size) {
    // 既存のキューブがあれば削除してメモリを解放
    if (cube) {
        scene.remove(cube);
        cube.geometry.dispose();
        cube.material.dispose();
    }

    // 新しいサイズのジオメトリを作成
    const geometry = new THREE.BoxGeometry(size, size, size);

    // ワイヤーフレーム用のジオメトリに変換
    const edges = new THREE.EdgesGeometry(geometry);

    // 位置ごとに色を変えるための処理
    const colors = [];
    const positions = edges.attributes.position.array;

    // 頂点の座標(X,Y,Z)を正規化してRGBカラーにマッピング
    const halfSize = size / 2;
    for (let i = 0; i < positions.length; i += 3) {
        // -halfSize ~ halfSize の範囲を 0.0 ~ 1.0 に変換
        const r = (positions[i] / size) + 0.5;
        const g = (positions[i+1] / size) + 0.5;
        const b = (positions[i+2] / size) + 0.5;
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
    cube.position.z = 1; // 画面(Z=0)より1cm手前に配置して浮き出させる
    scene.add(cube);
}

/**
 * コントローラーの各ボタンのイベントリスナーを登録する処理
 */
function setupControllers() {
    const btnLarge = document.getElementById('btn-large');
    const btnSmall = document.getElementById('btn-small');
    const btnFast = document.getElementById('btn-fast');
    const btnSlow = document.getElementById('btn-slow');

    // 「大」ボタン：サイズを10%増加して再生成
    btnLarge.addEventListener('click', () => {
        currentCubeSize *= 1.1;
        createCube(currentCubeSize);
    });

    // 「小」ボタン：サイズを10%減少して再生成
    btnSmall.addEventListener('click', () => {
        currentCubeSize *= 0.9;
        // 小さくなりすぎるのを防ぐ（例えば0.1cm以下にしない）
        if (currentCubeSize < 0.1) currentCubeSize = 0.1;
        createCube(currentCubeSize);
    });

    // 「速」ボタン：回転速度を2倍にする
    btnFast.addEventListener('click', () => {
        rotationSpeedX *= 2.0;
        rotationSpeedY *= 2.0;
    });

    // 「遅」ボタン：回転速度を0.5倍にする
    btnSlow.addEventListener('click', () => {
        rotationSpeedX *= 0.5;
        rotationSpeedY *= 0.5;
    });
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
