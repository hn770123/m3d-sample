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
let shadowPlane; // 影を受けるための床（背景）
let dirLight, ambientLight; // 光源

// コントローラー用の変数
let rotationSpeedX = 0.005; // X軸の回転速度
let rotationSpeedY = 0.01;  // Y軸の回転速度
let currentCubeSize = 3.0;  // キューブの現在のサイズ(cm)
let isDarkMode = true;      // 現在のモード（初期値は暗モード）
let clock = new THREE.Clock(); // アニメーション用クロック

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
    // 影のレンダリングを有効にする
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 柔らかい影
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

    // 4. 光源と背景（明モード用）の準備
    setupLightsAndBackground();

    // 5. Object（キューブ）の作成
    updateSceneMode();

    // 6. リサイズイベントの登録
    window.addEventListener('resize', onWindowResize);
}

/**
 * 光源と影を受け取る背景（床）を準備します（明モード用）
 */
function setupLightsAndBackground() {
    // --- 環境光 ---
    ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // 強すぎない環境光
    scene.add(ambientLight);

    // --- 平行光源（太陽光のような光） ---
    // 視点（Z=20付近）から斜めに当てて、奥（Z=-2）の背景に影を落とす
    dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    // 視点より少し右・上から当てることで影の形を立体的にする
    // 光源の位置を正面寄りにし、影が画面内に収まるように調整
    dirLight.position.set(0, 0, cameraDistance);
    dirLight.castShadow = true;

    // シャドウマップの解像度と範囲の設定
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 15;
    dirLight.shadow.camera.far = 25;
    // 影の投影範囲を適切に絞る（大きすぎると影の解像度が落ちるため）
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // --- 影を受けるための白い背景（床） ---
    // 画面いっぱいに広がるように大きなサイズにする
    const planeGeometry = new THREE.PlaneGeometry(100, 100);
    const planeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.1
    });
    shadowPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    // Z=-2 の位置に配置（キューブはZ=1なので奥に配置、以前より手前に寄せる）
    shadowPlane.position.z = -2;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
}

/**
 * 現在のモード（暗/明）に合わせてシーン全体の状態を更新します
 */
function updateSceneMode() {
    if (isDarkMode) {
        // --- 暗モード ---
        scene.background = new THREE.Color(0x000000); // 黒背景

        // 光源と影受け背景を非表示
        ambientLight.visible = false;
        dirLight.visible = false;
        shadowPlane.visible = false;

        createDarkCube(currentCubeSize);
    } else {
        // --- 明モード ---
        scene.background = new THREE.Color(0xffffff); // 白背景

        // 光源と影受け背景を表示
        ambientLight.visible = true;
        dirLight.visible = true;
        shadowPlane.visible = true;

        createLightCube(currentCubeSize);
    }
}

/**
 * 【暗モード用】カラフルなワイヤーフレームキューブを生成
 * @param {number} size - キューブの1辺のサイズ（cm）
 */
function createDarkCube(size) {
    removeCube();

    const geometry = new THREE.BoxGeometry(size, size, size);
    const edges = new THREE.EdgesGeometry(geometry);

    const colors = [];
    const positions = edges.attributes.position.array;

    for (let i = 0; i < positions.length; i += 3) {
        const r = (positions[i] / size) + 0.5;
        const g = (positions[i+1] / size) + 0.5;
        const b = (positions[i+2] / size) + 0.5;
        colors.push(r, g, b);
    }

    edges.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2
    });

    cube = new THREE.LineSegments(edges, material);
    cube.position.z = 1; // 画面(Z=0)より1cm手前に配置
    scene.add(cube);
}

/**
 * 【明モード用】影を落とす太いワイヤーフレームキューブ（黒）を生成
 * LineSegmentsは影を落とさないため、CylinderGeometryを使ってエッジをMeshで作成する
 * @param {number} size - キューブの1辺のサイズ（cm）
 */
function createLightCube(size) {
    removeCube();

    cube = new THREE.Group();
    cube.position.z = 1;

    // エッジの太さ（半径）
    const thickness = size * 0.05;
    // 円柱の長さ（角が重なる分を少し調整しても良いが、今回は単純にsizeにする）
    const edgeGeometry = new THREE.CylinderGeometry(thickness, thickness, size, 8);
    // 黒色のマテリアル
    const material = new THREE.MeshStandardMaterial({ color: 0x000000 });

    const half = size / 2;

    // 12本の辺を作成して配置するヘルパー関数
    function addEdge(x, y, z, rotationX, rotationY, rotationZ) {
        const edge = new THREE.Mesh(edgeGeometry, material);
        edge.position.set(x, y, z);
        edge.rotation.set(rotationX, rotationY, rotationZ);
        edge.castShadow = true;
        edge.receiveShadow = true;
        cube.add(edge);
    }

    // X軸に平行な4本の辺 (回転Z=90度)
    const rotX = Math.PI / 2;
    addEdge(0, half, half, 0, 0, rotX);
    addEdge(0, half, -half, 0, 0, rotX);
    addEdge(0, -half, half, 0, 0, rotX);
    addEdge(0, -half, -half, 0, 0, rotX);

    // Y軸に平行な4本の辺 (回転なし)
    addEdge(half, 0, half, 0, 0, 0);
    addEdge(half, 0, -half, 0, 0, 0);
    addEdge(-half, 0, half, 0, 0, 0);
    addEdge(-half, 0, -half, 0, 0, 0);

    // Z軸に平行な4本の辺 (回転X=90度)
    addEdge(half, half, 0, rotX, 0, 0);
    addEdge(half, -half, 0, rotX, 0, 0);
    addEdge(-half, half, 0, rotX, 0, 0);
    addEdge(-half, -half, 0, rotX, 0, 0);

    scene.add(cube);
}

/**
 * 現在のキューブを削除してメモリを解放する共通関数
 */
function removeCube() {
    if (cube) {
        scene.remove(cube);

        // Group内のすべての子要素のジオメトリとマテリアルを解放
        if (cube.isGroup) {
            cube.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        } else {
            if (cube.geometry) cube.geometry.dispose();
            if (cube.material) cube.material.dispose();
        }
    }
}

/**
 * コントローラーの各ボタンのイベントリスナーを登録する処理
 */
function setupControllers() {
    const btnMode = document.getElementById('btn-mode');
    const btnLarge = document.getElementById('btn-large');
    const btnSmall = document.getElementById('btn-small');
    const btnFast = document.getElementById('btn-fast');
    const btnSlow = document.getElementById('btn-slow');
    const btnReload = document.getElementById('btn-reload');

    // 「更新」ボタン：キャッシュを回避してリロードする
    btnReload.addEventListener('click', () => {
        // 現在のURLを取得し、クエリパラメータでタイムスタンプを付与することでキャッシュを無効化してリロード
        const url = new URL(window.location.href);
        url.searchParams.set('t', Date.now());
        window.location.href = url.toString();
    });

    // 「明/暗」モード切り替えボタン
    btnMode.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        btnMode.textContent = isDarkMode ? '明' : '暗'; // 次に切り替わるモードを表示
        updateSceneMode();
    });

    // 「大」ボタン：サイズを10%増加して再生成
    btnLarge.addEventListener('click', () => {
        currentCubeSize *= 1.1;
        updateSceneMode();
    });

    // 「小」ボタン：サイズを10%減少して再生成
    btnSmall.addEventListener('click', () => {
        currentCubeSize *= 0.9;
        // 小さくなりすぎるのを防ぐ（例えば0.1cm以下にしない）
        if (currentCubeSize < 0.1) currentCubeSize = 0.1;
        updateSceneMode();
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

    // X軸・Y軸の回転
    cube.rotation.x += rotationSpeedX;
    cube.rotation.y += rotationSpeedY;

    // Z軸の往復運動（約2秒で1往復）
    // Math.sin(time * Math.PI) で周期2秒、振幅1cmで Z=1 を中心に ±1cm 動く
    if (cube) {
        const time = clock.getElapsedTime();
        cube.position.z = 1 + Math.sin(time * Math.PI) * 1.0;
    }

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
