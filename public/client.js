
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const socket = io();

// --- SETUP THREE.JS (3D) ---
const container = document.getElementById('scene-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2a3a);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 20, 15); 
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const gridHelper = new THREE.GridHelper(50, 50, 0x888888, 0x555555); 
scene.add(gridHelper);

const anchorGroup = new THREE.Group();
scene.add(anchorGroup);
const tagGroup = new THREE.Group();
scene.add(tagGroup);
const objectGroup = new THREE.Group();
scene.add(objectGroup);

// --- AXIS GIZMO ---
const axisContainer = document.getElementById('axis-container');
const axisScene = new THREE.Scene();
const axisCamera = new THREE.PerspectiveCamera(50, axisContainer.clientWidth / axisContainer.clientHeight, 0.1, 10);
axisCamera.position.z = 2;
const axisRenderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
axisRenderer.setSize(axisContainer.clientWidth, axisContainer.clientHeight);
axisContainer.appendChild(axisRenderer.domElement);

const axisHelper = new THREE.AxesHelper(1);
axisScene.add(axisHelper);


const canvas2d = document.getElementById('main-2d-canvas');
const ctx2d = canvas2d.getContext('2d');

let roomMesh = null;
let anchorsData = [];
let objectsData = [];
let tagMeshes = {};
let tagDataStore = {};
let tagInterpolation = {};
let roomConfig = { length: 10, width: 8, height: 4 };

// --- 3D LOGIC ---
function createRoom3D(length, width, height) {
    if (roomMesh) scene.remove(roomMesh);
    const geometry = new THREE.BoxGeometry(length, height, width);
    const edges = new THREE.EdgesGeometry(geometry);
    roomMesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffff00 }));
    roomMesh.position.set(length/2, height/2, width/2);
    scene.add(roomMesh);
    roomConfig = { length, width, height };
}

function updateAnchors3D(anchors) {
    while(anchorGroup.children.length > 0) anchorGroup.remove(anchorGroup.children[0]);
    anchors.forEach(anc => {
        const geo = new THREE.SphereGeometry(0.15, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00aaff }); 
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(anc.x, anc.y, anc.z); 
        anchorGroup.add(mesh);
    });
}

function updateObjects3D() {
    while(objectGroup.children.length > 0) objectGroup.remove(objectGroup.children[0]);
    objectsData.forEach(obj => {
        const geometry = new THREE.BoxGeometry(obj.l, obj.h, obj.w);
        const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(obj.x, obj.y, obj.z);
        objectGroup.add(mesh);
    });
}

function updateTags3D(tags) {
    Object.keys(tags).forEach(id => {
        const targetPos = tags[id];
        if (!tagMeshes[id]) {
            const geo = new THREE.SphereGeometry(0.2, 32, 32);
            const mat = new THREE.MeshStandardMaterial({ color: 0xff4444 }); 
            const mesh = new THREE.Mesh(geo, mat);
            tagGroup.add(mesh);
            tagMeshes[id] = mesh;
            tagInterpolation[id] = {
                current: new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z),
                target: new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z),
            };
        }
        tagInterpolation[id].target.set(targetPos.x, targetPos.y, targetPos.z);
    });
}

function interpolateTagPositions() {
    Object.keys(tagInterpolation).forEach(id => {
        const interp = tagInterpolation[id];
        if(interp) {
            interp.current.lerp(interp.target, 0.2); // Increased interpolation factor for smoother animation
            if (tagMeshes[id]) {
                tagMeshes[id].position.copy(interp.current);
            }
        }
    });
}

// --- UI & EVENT LISTENERS ---
function updateTable(tags) {
    const tbody = document.getElementById('tag-table-body');
    if (Object.keys(tags).length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#999;">Chờ dữ liệu...</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    Object.keys(tags).forEach(id => {
        const pos = tags[id];
        const accuracyColor = pos.accuracy < 0.5 ? '#28a745' : pos.accuracy < 1.0 ? '#ffc107' : '#dc3545';
        const row = `<tr>
            <td><b>${id}</b></td>
            <td>${pos.x.toFixed(2)}</td>
            <td>${pos.y.toFixed(2)}</td>
            <td>${pos.z.toFixed(2)}</td>
            <td style="color:${accuracyColor};font-weight:bold;">${pos.accuracy !== undefined ? '±' + pos.accuracy.toFixed(2) + 'm' : 'N/A'}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

const anchorList = document.getElementById('anchor-list');
const objectList = document.getElementById('object-list');

function renderAnchorList() {
    anchorList.innerHTML = '';
    if (anchorsData.length === 0) {
        anchorList.innerHTML = '<p style="font-size:12px; color:#888; text-align:center;">Chưa có anchor nào.</p>';
    }
    anchorsData.forEach((anchor, index) => {
        const item = document.createElement('div');
        item.className = 'anchor-item';
        item.innerHTML = `
            <span class="anchor-id">A${index}</span>
            <input type="number" class="anchor-x" value="${anchor.x.toFixed(2)}" placeholder="x">
            <input type="number" class="anchor-y" value="${anchor.y.toFixed(2)}" placeholder="y">
            <input type="number" class="anchor-z" value="${anchor.z.toFixed(2)}" placeholder="z">
            <button class="btn-remove-anchor" data-index="${index}">X</button>
        `;
        anchorList.appendChild(item);
    });
    
    document.querySelectorAll('.btn-remove-anchor').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            anchorsData.splice(index, 1);
            renderAnchorList(); // Re-render after removal
        });
    });
}

function renderObjectList() {
    objectList.innerHTML = '';
    if (objectsData.length === 0) {
        objectList.innerHTML = '<p style="font-size:12px; color:#888; text-align:center;">Chưa có vật thể nào.</p>';
    }
    objectsData.forEach((obj, index) => {
        const item = document.createElement('div');
        item.className = 'object-item';
        item.innerHTML = `
            <span class="object-id">Vật thể ${index + 1}</span>
            <div class="object-item-details">
                <span>K.Thước: ${obj.l}x${obj.w}x${obj.h}</span>
                <span>Vị trí: (${obj.x}, ${obj.y}, ${obj.z})</span>
            </div>
            <button class="btn-remove-object" data-index="${index}">X</button>
        `;
        objectList.appendChild(item);
    });

    document.querySelectorAll('.btn-remove-object').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            objectsData.splice(index, 1);
            renderObjectList();
            updateObjects3D();
        });
    });
}

document.getElementById('btn-add-anchor').addEventListener('click', () => {
    anchorsData.push({ id: anchorsData.length, x: 0, y: 0, z: 0 });
    renderAnchorList();
});

document.getElementById('btn-save-anchors').addEventListener('click', () => {
    const newAnchors = [];
    document.querySelectorAll('#anchor-list .anchor-item').forEach((item, index) => {
        const x = parseFloat(item.querySelector('.anchor-x').value);
        const y = parseFloat(item.querySelector('.anchor-y').value);
        const z = parseFloat(item.querySelector('.anchor-z').value);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
            newAnchors.push({ id: index, x, y, z });
        }
    });
    anchorsData = newAnchors;
    socket.emit('set_anchors', anchorsData);
    updateAnchors3D(anchorsData);
    alert('Đã lưu lại vị trí các anchor!');
});

document.getElementById('btn-add-object').addEventListener('click', () => {
    const l = parseFloat(document.getElementById('inp-obj-l').value) || 1;
    const w = parseFloat(document.getElementById('inp-obj-w').value) || 1;
    const h = parseFloat(document.getElementById('inp-obj-h').value) || 1;
    const x = parseFloat(document.getElementById('inp-obj-x').value) || 0;
    const y = parseFloat(document.getElementById('inp-obj-y').value) || 0;
    const z = parseFloat(document.getElementById('inp-obj-z').value) || 0;
    objectsData.push({l, w, h, x, y, z});
    renderObjectList();
    updateObjects3D();
});

document.getElementById('btn-update-room').addEventListener('click', () => {
    const l = parseFloat(document.getElementById('inpL').value) || 10;
    const w = parseFloat(document.getElementById('inpW').value) || 8;
    const h = parseFloat(document.getElementById('inpH').value) || 4;
    createRoom3D(l, w, h);
    socket.emit('update_room_config', { length: l, width: w, height: h });
});

// --- SOCKET LISTENERS ---
socket.on('room_config_update', (cfg) => {
    roomConfig = cfg;
    createRoom3D(cfg.length, cfg.width, cfg.height);
    document.getElementById('inpL').value = cfg.length;
    document.getElementById('inpW').value = cfg.width;
    document.getElementById('inpH').value = cfg.height;
});

socket.on('anchors_updated', (data) => {
    anchorsData = data;
    updateAnchors3D(data);
    renderAnchorList(); 
});

socket.on('tags_update', (data) => {
    tagDataStore = data;
    updateTags3D(data);
    updateTable(data);
});

// --- ANIMATION LOOP & RESIZE ---
function animate() {
    requestAnimationFrame(animate);
    interpolateTagPositions();
    controls.update();
    
    // Render main scene
    renderer.render(scene, camera);

    // Render axis gizmo
    axisCamera.quaternion.copy(camera.quaternion);
    axisRenderer.render(axisScene, axisCamera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    axisCamera.aspect = axisContainer.clientWidth / axisContainer.clientHeight;
    axisCamera.updateProjectionMatrix();
    axisRenderer.setSize(axisContainer.clientWidth, axisContainer.clientHeight);
});

// Initial setup
renderAnchorList();
renderObjectList();
