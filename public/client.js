import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
 
const socket = io();
 
// --- SETUP THREE.JS (3D) ---
const container = document.getElementById('scene-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
 
// Dùng kích thước fallback nếu container đang ẩn
const initW = container.clientWidth || window.innerWidth - 260;
const initH = container.clientHeight || window.innerHeight - 56;
 
const camera = new THREE.PerspectiveCamera(60, initW / initH, 0.1, 1000);
camera.position.set(15, 20, 15);
camera.lookAt(0, 0, 0);
 
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(initW, initH);
container.appendChild(renderer.domElement);
 
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);
 
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
 
const gridHelper = new THREE.GridHelper(1000, 100, 0x535353, 0x3a3a3a);
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
const axisW = axisContainer.clientWidth || 80;
const axisH = axisContainer.clientHeight || 80;
const axisCamera = new THREE.PerspectiveCamera(50, axisW / axisH, 0.1, 10);
axisCamera.position.z = 2;
const axisRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
axisRenderer.setSize(axisW, axisH);
axisContainer.appendChild(axisRenderer.domElement);
 
const axisHelper = new THREE.AxesHelper(1);
axisScene.add(axisHelper);
 
const canvas2d = document.getElementById('main-2d-canvas');
const ctx2d = canvas2d ? canvas2d.getContext('2d') : null;
// --- BIẾN ĐIỀU KHIỂN 2D ---
let mapZoom = 1.0;
let mapPan = { x: 50, y: 50 };
let isMapDragging = false;
let mapLastMouse = { x: 0, y: 0 };

// Sự kiện Cuộn chuột để Zoom
canvas2d.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomSpeed = 0.1;
    if (e.deltaY < 0) mapZoom *= (1 + zoomSpeed);
    else mapZoom /= (1 + zoomSpeed);
    mapZoom = Math.min(Math.max(0.5, mapZoom), 5); // Giới hạn mức zoom
});

// Sự kiện Nhấn chuột để di chuyển (Pan)
// Sự kiện Nhấn chuột để di chuyển (Pan) - Dành cho PC
canvas2d.addEventListener('mousedown', (e) => {
    isMapDragging = true;
    mapLastMouse = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mousemove', (e) => {
    if (!isMapDragging) return;
    const dx = e.clientX - mapLastMouse.x;
    const dy = e.clientY - mapLastMouse.y;
    mapPan.x += dx;
    mapPan.y += dy;
    mapLastMouse = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => { isMapDragging = false; });

// --- THÊM SỰ KIỆN CẢM ỨNG (TOUCH) DÀNH CHO ĐIỆN THOẠI ---
let initialPinchDist = null;

canvas2d.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) { // Chạm 1 ngón để di chuyển
        isMapDragging = true;
        mapLastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) { // Chạm 2 ngón để chuẩn bị Zoom
        isMapDragging = false;
        initialPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
    }
}, { passive: false });

canvas2d.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Ngăn trình duyệt cuộn trang khi đang vuốt bản đồ
    if (e.touches.length === 1 && isMapDragging) {
        const dx = e.touches[0].clientX - mapLastMouse.x;
        const dy = e.touches[0].clientY - mapLastMouse.y;
        mapPan.x += dx;
        mapPan.y += dy;
        mapLastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && initialPinchDist !== null) {
        const currentPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        
        // Tính toán khoảng cách 2 ngón tay để Zoom in/out
        const zoomSpeed = 0.03;
        if (currentPinchDist > initialPinchDist) {
            mapZoom *= (1 + zoomSpeed); // Kéo giãn ra -> Zoom in
        } else if (currentPinchDist < initialPinchDist) {
            mapZoom /= (1 + zoomSpeed); // Thu hẹp lại -> Zoom out
        }
        mapZoom = Math.min(Math.max(0.5, mapZoom), 5); // Giới hạn mức zoom
        initialPinchDist = currentPinchDist;
    }
}, { passive: false });

canvas2d.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) initialPinchDist = null;
    if (e.touches.length === 1) {
        isMapDragging = true;
        mapLastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
        isMapDragging = false;
    }
});
// Đặt kích thước cho canvas
if (canvas2d) {
    canvas2d.width = window.innerWidth - 260 || 800; 
    canvas2d.height = window.innerHeight - 56 || 600;
}
 
let roomMesh = null;
let anchorsData = [];
let objectsData = [];
let tagMeshes = {};
let tagDataStore = {};
let tagInterpolation = {};
let roomConfig = { length: 10, width: 8, height: 4 };

// --- BOX DATA (thùng hàng có mã SKU) ---
let boxesData = {}; // { boxId: { name, sku, quantity, weight, note, location } }
let boxMeshMap = []; // [{ mesh, boxId }]
let currentUserRole = 'customer';

// Lấy thông tin user hiện tại
fetch('/api/auth/me').then(r => r.json()).then(u => { currentUserRole = u.role; }).catch(() => {});

// Lấy danh sách boxes từ server
async function loadBoxesData() {
    try {
        const res = await fetch('/api/boxes');
        const boxes = await res.json();
        boxesData = {};
        boxes.forEach(b => { boxesData[b.boxId] = b; });
    } catch(e) { console.warn('Không thể tải dữ liệu boxes'); }
}
loadBoxesData();

// Tạo texture label SKU cho thùng hàng
function makeBoxLabelTexture(boxId, sku) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d2a679';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#8b5e3c';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 122);
    ctx.fillStyle = '#fff8f0';
    ctx.fillRect(10, 10, 236, 108);
    ctx.fillStyle = '#1e3a5f';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(boxId, 128, 45);
    ctx.fillStyle = '#374151';
    ctx.font = '18px sans-serif';
    ctx.fillText(sku ? 'SKU: ' + sku : 'Chưa gắn SKU', 128, 80);
    ctx.fillStyle = '#6b7280';
    ctx.font = '13px sans-serif';
    ctx.fillText('Click để xem chi tiết', 128, 108);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}
 
// --- OBJECT SELECTION & MANIPULATION ---
let selectedObjects = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
 
function getObjectByMesh(mesh) {
    const index = objectGroup.children.indexOf(mesh);
    if (index !== -1) {
        return { data: objectsData[index], index };
    }
    return null;
}
 
function selectObject(mesh, additive = false) {
    if (!additive) {
        deselectAllObjects();
    }
 
    const index = selectedObjects.findIndex(obj => obj.uuid === mesh.uuid);
    if (index === -1) {
        selectedObjects.push(mesh);
        mesh.material.color.set(0xff0000); // Highlight
    } else {
        // If already selected in additive mode, deselect it
        mesh.material.color.set(0xaaaaaa);
        selectedObjects.splice(index, 1);
    }
}
 
function deselectAllObjects() {
    selectedObjects.forEach(obj => {
if(obj) obj.material.color.set(0xaaaaaa)
    });
    selectedObjects = [];
}
 
// --- Event Listeners for Controls and Selection ---
 
// Left-click to select hoặc xem thông tin thùng hàng
container.addEventListener('click', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const presetGroup = scene.getObjectByName('presetGroup');
    const dynamicBoxGroup = scene.getObjectByName('dynamicBoxGroup');
    const allMeshes = [];

    if (presetGroup) presetGroup.traverse(obj => { if (obj.isMesh && obj.userData.isBox) allMeshes.push(obj); });
    if (dynamicBoxGroup) dynamicBoxGroup.traverse(obj => { if (obj.isMesh && obj.userData.isBox) allMeshes.push(obj); });

    const boxHits = raycaster.intersectObjects(allMeshes, false);
    if (boxHits.length > 0) {
        if (typeof isPickingMode !== 'undefined' && isPickingMode) return; 
        openBoxPopup(boxHits[0].object.userData.boxId, event.clientX, event.clientY);
        return;
    }

    const intersects = raycaster.intersectObjects(objectGroup.children);
    if (intersects.length > 0) {
        const firstIntersected = intersects[0].object;
        const isAdditive = event.shiftKey;
        selectObject(firstIntersected, isAdditive);
    } else {
        deselectAllObjects();
    }
});
 
// --- Context Menu Logic ---
const contextMenu = document.getElementById('context-menu');
 
container.addEventListener('contextmenu', (event) => {
    event.preventDefault();
 
    // Raycast to see if we're clicking on an object
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(objectGroup.children);
 
    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        if (!selectedObjects.includes(clickedMesh)) {
            selectObject(clickedMesh, false);
        }
    }
 
    // Show context menu
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
});
 
// Hide context menu on left-click
window.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        contextMenu.style.display = 'none';
    }
});
 
document.getElementById('ctx-duplicate').addEventListener('click', () => {
    if (selectedObjects.length > 0) {
        selectedObjects.forEach(mesh => {
            const objInfo = getObjectByMesh(mesh);
            if (objInfo) {
                 const newObject = { ...objInfo.data };
                newObject.x += 0.5; // Offset pasted object slightly
                newObject.y += 0.5;
                objectsData.push(newObject);
            }
        });
        renderObjectList();
        updateObjects3D();
    }
    contextMenu.style.display = 'none';
});
 
document.getElementById('ctx-delete').addEventListener('click', () => {
    if (selectedObjects.length > 0) {
        const idsToDelete = selectedObjects.map(mesh => {
            const objInfo = getObjectByMesh(mesh);
            return objInfo ? objInfo.index : -1;
        }).filter(index => index !== -1);
 
        // Sort indices in descending order to avoid messing up subsequent indices when splicing
        idsToDelete.sort((a, b) => b - a);
 
        idsToDelete.forEach(index => {
            objectsData.splice(index, 1);
        });
deselectAllObjects();
        renderObjectList();
        updateObjects3D();
    }
    contextMenu.style.display = 'none';
});
 
 
// --- 3D LOGIC ---
function createRoom3D(length, width, height) {
    if (roomMesh) scene.remove(roomMesh);
    const geometry = new THREE.BoxGeometry(length, height, width);
    const material = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
    });
    roomMesh = new THREE.Mesh(geometry, material);
 
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xe94560 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    roomMesh.add(wireframe);
 
    roomMesh.position.set(length / 2, height / 2, width / 2);
    scene.add(roomMesh);
    roomConfig = { length, width, height };
}
 
function updateAnchors3D(anchors) {
    while (anchorGroup.children.length > 0) anchorGroup.remove(anchorGroup.children[0]);
    anchors.forEach(anc => {
        const geo = new THREE.SphereGeometry(0.15, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00aaff });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(anc.x, anc.z, anc.y);
        anchorGroup.add(mesh);
    });
}
 
function updateObjects3D() {
    // Preserve selection
    const previouslySelectedUUIDs = selectedObjects.map(m => m.uuid);
    deselectAllObjects();
 
    while (objectGroup.children.length > 0) objectGroup.remove(objectGroup.children[0]);
 
    objectsData.forEach(obj => {
        const geometry = new THREE.BoxGeometry(obj.l, obj.h, obj.w);
        const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(obj.x, obj.z, obj.y);
        objectGroup.add(mesh);
    });
 
    // Re-select objects
    objectGroup.children.forEach(mesh => {
        if (previouslySelectedUUIDs.includes(mesh.uuid)) {
            selectObject(mesh, true);
        }
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
                current: new THREE.Vector3(targetPos.x, targetPos.z, targetPos.y),
                target: new THREE.Vector3(targetPos.x, targetPos.z, targetPos.y),
            };
        }
        tagInterpolation[id].target.set(targetPos.x, targetPos.z, targetPos.y);
    });
}
 
function interpolateTagPositions() {
    Object.keys(tagInterpolation).forEach(id => {
        const interp = tagInterpolation[id];
        if (interp) {
interp.current.lerp(interp.target, 0.2);
            if (tagMeshes[id]) {
                tagMeshes[id].position.copy(interp.current);
            }
        }
    });
}
 
// --- KEYBOARD CONTROLS ---
const keyStates = {};
window.addEventListener('keydown', (event) => {
    keyStates[event.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (event) => {
    keyStates[event.key.toLowerCase()] = false;
});
 
function updateCameraMovement() {
    const moveSpeed = 5.0;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const forwardOnPlane = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, forward).normalize();
 
    if (keyStates['w']) {
        const moveVector = forwardOnPlane.clone().multiplyScalar(moveSpeed * 0.1);
        camera.position.add(moveVector);
        controls.target.add(moveVector);
    }
    if (keyStates['s']) {
        const moveVector = forwardOnPlane.clone().multiplyScalar(moveSpeed * 0.1);
        camera.position.sub(moveVector);
        controls.target.sub(moveVector);
    }
    if (keyStates['d']) {
        const moveVector = right.clone().multiplyScalar(moveSpeed * 0.1);
        camera.position.sub(moveVector);
        controls.target.sub(moveVector);
    }
    if (keyStates['a']) {
        const moveVector = right.clone().multiplyScalar(moveSpeed * 0.1);
        camera.position.add(moveVector);
        controls.target.add(moveVector);
    }
}
 
function updateObjectMovement() {
    if (selectedObjects.length === 0) return;
 
    const moveSpeed = 2.0; // Units per second
    const delta = 0.016; // assume 60fps for now
 
    const moveDistance = moveSpeed * delta;
 
    let moveX = 0;
    let moveY = 0;
    let moveZ = 0;
 
    if (keyStates['arrowup']) {
        moveZ = -moveDistance;
    }
    if (keyStates['arrowdown']) {
        moveZ = moveDistance;
    }
    if (keyStates['arrowleft']) {
        moveX = -moveDistance;
    }
    if (keyStates['arrowright']) {
        moveX = moveDistance;
    }
    if (keyStates['pageup']) {
        moveY = moveDistance;
    }
    if (keyStates['pagedown']) {
        moveY = -moveDistance;
    }
 
    if (moveX !== 0 || moveY !== 0 || moveZ !== 0) {
        selectedObjects.forEach(mesh => {
            const objInfo = getObjectByMesh(mesh);
            if (!objInfo) return;
 
            const { data } = objInfo;
            const halfL = data.l / 2;
            const halfW = data.w / 2;
            const halfH = data.h / 2;
 
            // Calculate new position
            let newX = mesh.position.x + moveX;
            let newY = mesh.position.y + moveY;
            let newZ = mesh.position.z + moveZ;
 
            // Clamp position within room boundaries
            newX = Math.max(halfL, Math.min(newX, roomConfig.length - halfL));
            newZ = Math.max(halfW, Math.min(newZ, roomConfig.width - halfW));
newY = Math.max(halfH, Math.min(newY, roomConfig.height - halfH));
 
            // Apply the clamped position
            mesh.position.set(newX, newY, newZ);
 
 
            // Update the underlying data
            const newPos = mesh.position;
            data.x = newPos.x;
            data.y = newPos.z;
            data.z = newPos.y;
        });
        renderObjectList(); // Update the UI panel
    }
}
 
 
// --- UI & EVENT LISTENERS ---
 
let isRecording = false;
const btnRecordLog = document.getElementById('btn-record-log');
const logFileList = document.getElementById('log-file-list');
let currentLogData = [];
 
btnRecordLog.addEventListener('click', () => {
    isRecording = !isRecording;
    btnRecordLog.textContent = isRecording ? 'Stop' : 'Record';
    btnRecordLog.classList.toggle('active', isRecording);
 
    if (!isRecording && currentLogData.length > 0) {
        // Stop recording and generate file
        const csvContent = "data:text/csv;charset=utf-8," 
            + "Timestamp,ID,X,Y,Z\n" 
            + currentLogData.map(e => `${e.timestamp},${e.id},${e.x.toFixed(3)},${e.y.toFixed(3)},${e.z.toFixed(3)}`).join("\n");
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        
        const now = new Date();
        const filename = `tag_log_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}.csv`;
        link.setAttribute("download", filename);
        link.textContent = filename;
 
        const listItem = document.createElement('li');
        listItem.appendChild(link);
        logFileList.appendChild(listItem);
 
        currentLogData = []; // Reset for next recording
         updateCollapsibleHeight(document.querySelector('#tag-history-section .collapsible-content'));
 
    } else if (isRecording) {
        // Start recording
        currentLogData = [];
    }
});
 
 
function updateCollapsibleHeight(content) {
    if (content && content.style.maxHeight && content.style.maxHeight !== '0px' && content.style.maxHeight !== 'fit-content') {
        content.style.maxHeight = content.scrollHeight + "px";
    }
}
 
function updateTable(tags) {
    const tbody = document.getElementById('tag-table-body');
    if (Object.keys(tags).length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#999;">Waiting for data...</td></tr>';
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
            <td style="color:${accuracyColor};font-weight:bold;">${pos.accuracy !== undefined ? '±' + pos.accuracy.toFixed(2) : 'N/A'}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}
 
const anchorList = document.getElementById('anchor-list');
const objectList = document.getElementById('object-list');
 
function renderAnchorList() {
    anchorList.innerHTML = '';
    anchorsData.forEach((anchor, index) => {
        const item = document.createElement('div');
        item.className = 'anchor-item';
        item.innerHTML = `
            <span class="anchor-id">A${index}</span>
            <input type="number" class="anchor-x" value="${anchor.x.toFixed(2)}" placeholder="x" data-index="${index}">
            <input type="number" class="anchor-y" value="${anchor.y.toFixed(2)}" placeholder="y" data-index="${index}">
            <input type="number" class="anchor-z" value="${anchor.z.toFixed(2)}" placeholder="z" data-index="${index}">
            <button class="btn-remove-anchor" data-index="${index}">X</button>
        `;
        anchorList.appendChild(item);
    });
 
    document.querySelectorAll('.btn-remove-anchor').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            anchorsData.splice(index, 1);
            saveAnchors();
            renderAnchorList();
        });
    });
 
    document.querySelectorAll('#anchor-list input').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            const axis = e.target.classList.contains('anchor-x') ? 'x' : e.target.classList.contains('anchor-y') ? 'y' : 'z';
            anchorsData[index][axis] = parseFloat(e.target.value);
            saveAnchors();
        });
    });
}
 
function saveAnchors() {
    socket.emit('set_anchors', anchorsData);
    updateAnchors3D(anchorsData);
}
 
function renderObjectList() {
    objectList.innerHTML = '';
    objectsData.forEach((obj, index) => {
        const item = document.createElement('div');
        item.className = 'object-item';
        item.innerHTML = `
            <div class="object-header">
                <span class="object-id">OBJ ${index + 1}</span>
                <div>
                    <button class="btn-duplicate-object" data-index="${index}">Dup</button>
                    <button class="btn-remove-object" data-index="${index}">Del</button>
                </div>
            </div>
            <div class="object-props">
                <div class="prop-group">
                    <label>Kích thước:</label>
                    <input type="number" class="obj-l" value="${obj.l}" data-index="${index}" placeholder="D">
                    <input type="number" class="obj-w" value="${obj.w}" data-index="${index}" placeholder="R">
<input type="number" class="obj-h" value="${obj.h}" data-index="${index}" placeholder="C">
                </div>
                <div class="prop-group">
                    <label>Vị trí:</label>
                    <input type="number" class="obj-x" value="${obj.x}" data-index="${index}" placeholder="X">
                    <input type="number" class="obj-y" value="${obj.y}" data-index="${index}" placeholder="Y">
                    <input type="number" class="obj-z" value="${obj.z}" data-index="${index}" placeholder="Z">
                </div>
            </div>
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
 
    document.querySelectorAll('.btn-duplicate-object').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const originalObject = objectsData[index];
            if (originalObject) {
                const newObject = { ...originalObject };
                newObject.x += 0.5; // Offset duplicated object slightly
                newObject.y += 0.5;
                objectsData.push(newObject);
                renderObjectList();
                updateObjects3D();
            }
        });
    });
 
    document.querySelectorAll('#object-list input').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            const prop = e.target.classList[0].split('-')[1];
            objectsData[index][prop] = parseFloat(e.target.value);
            updateObjects3D();
        });
    });
}
 
document.getElementById('btn-add-anchor').addEventListener('click', () => {
    anchorsData.push({ id: anchorsData.length, x: 0, y: 0, z: 0 });
    renderAnchorList();
    saveAnchors();
    updateCollapsibleHeight(document.querySelector('#anchors-section .collapsible-content'));
 
});
 
document.getElementById('btn-add-object').addEventListener('click', () => {
    objectsData.push({ l: 1, w: 1, h: 1, x: 0, y: 0, z: 0 });
    renderObjectList();
    updateObjects3D();
    updateCollapsibleHeight(document.querySelector('#objects-section .collapsible-content'));
});
 
document.getElementById('inpL').addEventListener('change', updateRoom);
document.getElementById('inpW').addEventListener('change', updateRoom);
document.getElementById('inpH').addEventListener('change', updateRoom);
 
function updateRoom() {
    const l = parseFloat(document.getElementById('inpL').value) || 10;
    const w = parseFloat(document.getElementById('inpW').value) || 8;
    const h = parseFloat(document.getElementById('inpH').value) || 4;
    createRoom3D(l, w, h);
socket.emit('update_room_config', { length: l, width: w, height: h });
}
 
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
 
    if (isRecording) {
        const now = new Date();
        const timestamp = now.toLocaleTimeString('it-IT'); // Use a consistent format
        Object.keys(data).forEach(id => {
            const pos = data[id];
            currentLogData.push({
                timestamp: timestamp,
                id: id,
                x: pos.x,
                y: pos.y,
                z: pos.z
            });
        });
    }
});
 
// --- ANIMATION LOOP & RESIZE ---\
function render2D() {
    const mapCont = document.getElementById('map-2d-container');
    if (!ctx2d || !mapCont || mapCont.style.display === 'none') return;

    const baseScale = 20; 
    const currentScale = baseScale * mapZoom;

    ctx2d.clearRect(0, 0, canvas2d.width, canvas2d.height);

    // 1. Vẽ mặt sàn kho (Tỷ lệ chuẩn 15x30m)
    ctx2d.fillStyle = '#f8f9fa';
    ctx2d.fillRect(mapPan.x, mapPan.y, 15 * currentScale, 30 * currentScale);
    ctx2d.strokeStyle = '#333';
    ctx2d.lineWidth = 2;
    ctx2d.strokeRect(mapPan.x, mapPan.y, 15 * currentScale, 30 * currentScale);

    // 2. Hàm vẽ kệ chi tiết từng ô
    const drawDetailedRack2D = (x, z, bays, bayLen, rackWidth, color, label) => {
        const totalZ = bays * bayLen;
        const startX = (x - rackWidth/2) * currentScale + mapPan.x;
        const startZ = (z - totalZ/2) * currentScale + mapPan.y;
        const w = rackWidth * currentScale;
        const h = totalZ * currentScale;

        // Vẽ khung kệ
        ctx2d.fillStyle = color;
        ctx2d.globalAlpha = 0.2;
        ctx2d.fillRect(startX, startZ, w, h);
        ctx2d.globalAlpha = 1.0;
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth = 1;
        ctx2d.strokeRect(startX, startZ, w, h);

        // Vẽ các vạch chia ô hàng (Bays)
        for(let i=1; i < bays; i++) {
            const lineZ = startZ + (i * bayLen * currentScale);
            ctx2d.beginPath();
            ctx2d.moveTo(startX, lineZ);
            ctx2d.lineTo(startX + w, lineZ);
            ctx2d.stroke();
        }

        // Nhãn tên kệ
        ctx2d.fillStyle = color;
        ctx2d.font = `bold ${Math.max(9, 11 * mapZoom)}px sans-serif`;
        ctx2d.textAlign = 'center';
        ctx2d.fillText(label, startX + w/2, startZ - 5);
    };

    // Vẽ Kệ R1 (Trái) & R2 (Giữa trái) - Mỗi dãy 3 block
    [3.4, 7.7, 12.0].forEach((z, idx) => {
        drawDetailedRack2D(2.4, z, 4, 1.0, 1.0, '#3b82f6', `R1-${idx+1}`);
        drawDetailedRack2D(6.4, z, 4, 1.0, 1.0, '#3b82f6', `R2-${idx+1}`);
    });

    // Vẽ Kệ R3 & R4 (Phải) - Dãy dài 12 ô
    drawDetailedRack2D(7.5, 7.7, 12, 1.2, 1.0, '#1e40af', 'R3');
    drawDetailedRack2D(14.5, 7.7, 12, 1.2, 1.0, '#1e40af', 'R4');

// 3. Vẽ hàng hóa (Khớp tọa độ 3D) & Highlight mục tiêu đang tới
const displayMode = document.getElementById('route-display-mode-3d') ? document.getElementById('route-display-mode-3d').value : 'full';
    
boxMeshMap.forEach(item => {
    const pos = new THREE.Vector3(); 
    item.mesh.getWorldPosition(pos);
    
    let isTarget = false;
    // Đã sửa thành currentRouteStep + 1 để nhắm vào ĐÍCH ĐẾN của chặng
    if (window.isPickingMode && displayMode === 'step' && window.routeStopIndices && window.routeStopIndices[window.currentRouteStep] !== undefined) {
        if (window.orderedVisits && window.orderedVisits[window.currentRouteStep + 1] && window.orderedVisits[window.currentRouteStep + 1].boxId === item.boxId) {
            isTarget = true;
        }
    }
    
    const px = pos.x * currentScale + mapPan.x;
    const pz = pos.z * currentScale + mapPan.y;

    // Nếu là mục tiêu thì vẽ hiệu ứng quầng sáng to và rõ hơn
    if (isTarget) {
        // Lớp sáng mờ bên ngoài
        ctx2d.beginPath();
        ctx2d.arc(px, pz, 14 * mapZoom, 0, Math.PI * 2);
        ctx2d.fillStyle = 'rgba(16, 185, 129, 0.3)'; 
        ctx2d.fill();
        
        // Lớp sáng đậm bên trong
        ctx2d.beginPath();
        ctx2d.arc(px, pz, 8 * mapZoom, 0, Math.PI * 2);
        ctx2d.fillStyle = 'rgba(16, 185, 129, 0.6)';
        ctx2d.fill();
    }

    ctx2d.fillStyle = isTarget ? '#4ade80' : '#d97706'; // Nổi bật điểm đích bằng màu xanh ngọc sáng
    ctx2d.beginPath();
    ctx2d.arc(px, pz, (isTarget ? 6 : 4) * mapZoom, 0, Math.PI * 2);
    ctx2d.fill();
});

// 4. Vẽ đường đi Picking (Đồng bộ từng chặng)
if (window.currentRoutePoints && window.isPickingMode) {
    let pointsToDraw = window.currentRoutePoints;
    
    if (displayMode === 'step' && window.routeStopIndices) {
        let startIdx = window.currentRouteStep === 0 ? 0 : window.routeStopIndices[window.currentRouteStep - 1];
        let endIdx = window.routeStopIndices[window.currentRouteStep];
        if (endIdx !== undefined) {
            pointsToDraw = window.currentRoutePoints.slice(startIdx, endIdx + 1);
        }
    }

    const flatPoints = [];
    pointsToDraw.forEach(p => {
        const px = p.x * currentScale + mapPan.x;
        const pz = p.z * currentScale + mapPan.y;
        if (flatPoints.length === 0) {
            flatPoints.push({x: px, z: pz});
        } else {
            const last = flatPoints[flatPoints.length - 1];
            if (Math.hypot(last.x - px, last.z - pz) > 0.1) { 
                flatPoints.push({x: px, z: pz});
            }
        }
    });

    if (flatPoints.length > 1) {
        // Lớp nền mờ
        ctx2d.strokeStyle = 'rgba(16, 185, 129, 0.25)';
        ctx2d.lineWidth = 5;
        ctx2d.beginPath();
        flatPoints.forEach((p, i) => { if (i === 0) ctx2d.moveTo(p.x, p.z); else ctx2d.lineTo(p.x, p.z); });
        ctx2d.stroke();

        // Nét đứt chạy liên tục
        ctx2d.strokeStyle = '#10b981';
        ctx2d.lineWidth = 3;
        ctx2d.setLineDash([12, 16]); 
        ctx2d.lineDashOffset = -(Date.now() % 100000) / 30; 
        
        ctx2d.beginPath();
        flatPoints.forEach((p, i) => { if (i === 0) ctx2d.moveTo(p.x, p.z); else ctx2d.lineTo(p.x, p.z); });
        ctx2d.stroke();
        ctx2d.setLineDash([]);
    }
}

    // Vẽ lớp nền mờ bên dưới
    ctx2d.strokeStyle = 'rgba(16, 185, 129, 0.25)';
    ctx2d.lineWidth = 5;
    ctx2d.beginPath();
    flatPoints.forEach((p, i) => { if (i === 0) ctx2d.moveTo(p.x, p.z); else ctx2d.lineTo(p.x, p.z); });
    ctx2d.stroke();

    // Vẽ nét đứt chạy liên tục bên trên (tạo cảm giác mũi tên trượt đi)
    ctx2d.strokeStyle = '#10b981';
    ctx2d.lineWidth = 3;
    ctx2d.setLineDash([12, 16]); // Độ dài nét đứt và khoảng trắng
    ctx2d.lineDashOffset = -(Date.now() % 100000) / 30; // Chạy liên tục mượt mà
    
    ctx2d.beginPath();
    flatPoints.forEach((p, i) => { if (i === 0) ctx2d.moveTo(p.x, p.z); else ctx2d.lineTo(p.x, p.z); });
    ctx2d.stroke();
    
    ctx2d.setLineDash([]); // Reset để không làm hỏng các hình khác
}
function animate() {
    requestAnimationFrame(animate);
    updateCameraMovement();
    updateObjectMovement();
    interpolateTagPositions();
    controls.update();
    
// --- BỔ SUNG: Cập nhật 2D và hiệu ứng chuyển động ---
render2D(); 
if (window.routeTexture) {
    // Trôi liên tục dựa trên thời gian thực, đồng bộ với 2D
    window.routeTexture.offset.x = -(Date.now() % 100000) / 800; 
}
    // ----------------------------------------------

    renderer.render(scene, camera);
    axisCamera.quaternion.copy(camera.quaternion);
    axisRenderer.render(axisScene, axisCamera);
}
animate();
 
window.addEventListener('resize', () => {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
 
    axisCamera.aspect = axisContainer.clientWidth / axisContainer.clientHeight;
    axisCamera.updateProjectionMatrix();
    axisRenderer.setSize(axisContainer.clientWidth, axisContainer.clientHeight);
});
 
// --- PRESET WAREHOUSE LOGIC ---
function loadMekongPreset() {
    document.getElementById('inpL').value = 15.0;
    document.getElementById('inpW').value = 30.0;
    document.getElementById('inpH').value = 5.0;
    updateRoom();
 
    let presetGroup = scene.getObjectByName('presetGroup');
    if (!presetGroup) {
        presetGroup = new THREE.Group();
        presetGroup.name = 'presetGroup';
        scene.add(presetGroup);
    }
    while (presetGroup.children.length > 0) {
        presetGroup.remove(presetGroup.children[0]);
    }
 
    function createSolidBox(color, x, z, sizeX, sizeZ, sizeY) {
        const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
        const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
        const mesh = new THREE.Mesh(geo, mat);
        const edges = new THREE.EdgesGeometry(geo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        mesh.add(new THREE.LineSegments(edges, lineMat));
        mesh.position.set(x, sizeY / 2, z);
presetGroup.add(mesh);
    }
 
    function createDetailedRack(x, z, sizeX, bayLength, bays, sizeY, tiers = 3, hasBoxes = false, rackId = 'R') {
        const rackGroup = new THREE.Group();
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 }); 
        const shelfMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.5 }); 
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }); 
        const frameThick = 0.08, shelfThick = 0.05; 
        const bottomTierY = sizeY * 0.15, topTierY = sizeY * 0.85; 
        const tierSpacing = (topTierY - bottomTierY) / (tiers - 1); 
        const totalZ = bays * bayLength;
 
        for (let j = 0; j <= bays; j++) {
            const isProtruding = (j % 2 === 0); 
            const pH = isProtruding ? sizeY : topTierY + shelfThick / 2; 
            const pillarGeo = new THREE.BoxGeometry(frameThick, pH, frameThick);
            const pZ = -totalZ/2 + j * bayLength;
            const pX_arr = [sizeX/2 - frameThick/2, -sizeX/2 + frameThick/2];
            for (let px of pX_arr) {
                const pillar = new THREE.Mesh(pillarGeo, frameMat);
                pillar.position.set(px, pH / 2, pZ); 
                rackGroup.add(pillar);
            }
        }
 
        const shelfGeo = new THREE.BoxGeometry(sizeX, shelfThick, bayLength);
        const shelfEdges = new THREE.EdgesGeometry(shelfGeo);
        const shelfLineMat = new THREE.LineBasicMaterial({ color: 0x552200, linewidth: 1 }); 
        const boxHeight = tierSpacing * 0.65;
        const boxGeo = new THREE.BoxGeometry(sizeX * 0.75, boxHeight, bayLength * 0.8);
        const boxEdges = new THREE.EdgesGeometry(boxGeo);
        const boxLineMat = new THREE.LineBasicMaterial({ color: 0x5c4033, linewidth: 1 }); 
 
        for (let j = 0; j < bays; j++) {
            const shelfZ = -totalZ/2 + j * bayLength + bayLength/2;
            for (let i = 0; i < tiers; i++) {
                const shelf = new THREE.Mesh(shelfGeo, shelfMat);
                shelf.add(new THREE.LineSegments(shelfEdges, shelfLineMat));
                const tierY = bottomTierY + i * tierSpacing;
                shelf.position.set(0, tierY, shelfZ);
                rackGroup.add(shelf);
                if (hasBoxes) {
                    const boxId = `${rackId}-B${j+1}T${i+1}`;
                    const boxInfo = boxesData[boxId] || {};
                    const mats = [
                        new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }),
                        new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }),
                        new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.9 }),
                        new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.9 }),
                        new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }),
                        new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }),
                    ];
                    const boxMesh = new THREE.Mesh(boxGeo, mats);
                    boxMesh.add(new THREE.LineSegments(boxEdges, boxLineMat));
                    boxMesh.position.set(0, tierY + (shelfThick / 2) + (boxHeight / 2), shelfZ);
                    boxMesh.userData.boxId = boxId;
                    boxMesh.userData.isBox = true;
                    rackGroup.add(boxMesh);
                    boxMeshMap.push({ mesh: boxMesh, boxId });
                }
            }
        }
        rackGroup.position.set(x, 0, z);
        presetGroup.add(rackGroup);
    }
 
    function createHangingLight(x, z, startY, endY) {
        const lightGroup = new THREE.Group();
        
        const wireLen = startY - endY;
        const wireGeo = new THREE.CylinderGeometry(0.015, 0.015, wireLen);
const wireMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const wire = new THREE.Mesh(wireGeo, wireMat);
        wire.position.set(0, endY + wireLen/2, 0); 
        lightGroup.add(wire);
 
        const shadeGeo = new THREE.ConeGeometry(0.25, 0.3, 16);
        const shadeMat = new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.4 }); 
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.position.set(0, endY, 0);
        lightGroup.add(shade);
 
        const bulbGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb }); 
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(0, endY - 0.1, 0);
        lightGroup.add(bulb);
 
        lightGroup.position.set(x, 0, z);
        presetGroup.add(lightGroup);
    }
 
    const rackWidth = 1.0; 
    const lowHeight = 2.8; 
    const highHeight = 3.0; 
 
    // Kệ R1 và R2 (2 dãy nhỏ bên trái)
    for(let i = 0; i < 3; i++) {
        const currentZ = 3.4 + i * 4.3; 
        createDetailedRack(2.4, currentZ, rackWidth, 1.0, 4, lowHeight, 3, false); 
        createDetailedRack(6.4, currentZ, rackWidth, 1.0, 4, lowHeight, 3, false); 
    }

    // Kệ R3 và R4 (2 dãy lớn bên phải - trả về đúng tọa độ X=7.5 và X=14.5, Z=7.7)
    createDetailedRack(7.5, 7.7, rackWidth, 1.2, 12, highHeight, 3, false, 'R3');
    createDetailedRack(14.5, 7.7, rackWidth, 1.2, 12, highHeight, 3, false, 'R4');
 
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const wingGeo = new THREE.BoxGeometry(1.0, 2.5, 0.1);
    const commonDoorMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });
    
    const wingEdges = new THREE.EdgesGeometry(wingGeo);
    const leftWing = new THREE.Mesh(wingGeo, commonDoorMat); leftWing.add(new THREE.LineSegments(wingEdges, lineMat));
    const rightWing = new THREE.Mesh(wingGeo, commonDoorMat); rightWing.add(new THREE.LineSegments(wingEdges, lineMat));
    leftWing.position.set(1.0, 1.25, 29.95); presetGroup.add(leftWing);
    rightWing.position.set(2.0, 1.25, 29.95); presetGroup.add(rightWing);
 
    const rollGeo = new THREE.BoxGeometry(3.5, 3.5, 0.1);
    const rollEdges = new THREE.EdgesGeometry(rollGeo);
    const rollDoor1 = new THREE.Mesh(rollGeo, commonDoorMat); rollDoor1.add(new THREE.LineSegments(rollEdges, lineMat));
    const rollDoor2 = new THREE.Mesh(rollGeo, commonDoorMat); rollDoor2.add(new THREE.LineSegments(rollEdges, lineMat));
    rollDoor1.position.set(7.5, 1.75, 29.95); presetGroup.add(rollDoor1);
    rollDoor2.position.set(12.0, 1.75, 29.95); presetGroup.add(rollDoor2);
 
    const shellMat = new THREE.MeshStandardMaterial({ 
        color: 0xe5e7eb, roughness: 0.2, transparent: true, opacity: 0.3, side: THREE.DoubleSide 
    });
 // --- TẠO MẶT SÀN KHO PRESET TRẮNG XÁM ---
 const floorGeo = new THREE.PlaneGeometry(15.0, 30.0); // Kích thước vừa đúng 15x30 của kho preset
 const floorMat = new THREE.MeshStandardMaterial({ 
     color: 0xe5e7eb, // Màu trắng xám
     roughness: 0.9 
 });
 const presetFloor = new THREE.Mesh(floorGeo, floorMat);
 presetFloor.rotation.x = -Math.PI / 2;
 // Đặt ở vị trí trung tâm của kho (X: 7.5, Y: 0, Z: 15.0)
 presetFloor.position.set(7.5, 0.01, 15.0); 
 presetGroup.add(presetFloor);
    const wallThick = 0.05;
    const wallHeight = 5.0;
    
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallHeight, 30.0), shellMat);
leftWall.position.set(0, wallHeight/2, 15.0);
    presetGroup.add(leftWall);
 
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallHeight, 30.0), shellMat);
    rightWall.position.set(15.0, wallHeight/2, 15.0);
    presetGroup.add(rightWall);
 
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(15.0, wallHeight, wallThick), shellMat);
    backWall.position.set(7.5, wallHeight/2, 0);
    presetGroup.add(backWall);
 
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(15.0, wallHeight, wallThick), shellMat);
    frontWall.position.set(7.5, wallHeight/2, 30.0);
    presetGroup.add(frontWall);
 
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-7.5, 0);
    gableShape.lineTo(7.5, 0);
    gableShape.lineTo(0, 2.5);
    gableShape.lineTo(-7.5, 0);
    
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: wallThick, bevelEnabled: false });
    gableGeo.translate(0, 0, -wallThick / 2);
 
    const backGable = new THREE.Mesh(gableGeo, shellMat);
    backGable.position.set(7.5, wallHeight, 0); 
    presetGroup.add(backGable);
 
    const frontGable = new THREE.Mesh(gableGeo, shellMat);
    frontGable.position.set(7.5, wallHeight, 30.0); 
    presetGroup.add(frontGable);
 
    const roofPeak = 2.5;  
    const halfW = 7.5;     
    const slantLen = Math.sqrt(halfW * halfW + roofPeak * roofPeak); 
    const roofAngle = Math.atan2(roofPeak, halfW);
 
    const roofGeo = new THREE.BoxGeometry(slantLen, 0.05, 30.0, 1, 1, 8); 
    const roofEdges = new THREE.EdgesGeometry(roofGeo);
    const trussMat = new THREE.LineBasicMaterial({ color: 0x374151, linewidth: 2 }); 
 
    const leftRoof = new THREE.Mesh(roofGeo, shellMat);
    leftRoof.add(new THREE.LineSegments(roofEdges, trussMat));
    leftRoof.position.set(halfW / 2, wallHeight + roofPeak / 2, 15.0);
    leftRoof.rotation.z = roofAngle;
    presetGroup.add(leftRoof);
 
    const rightRoof = new THREE.Mesh(roofGeo, shellMat);
    rightRoof.add(new THREE.LineSegments(roofEdges, trussMat));
    rightRoof.position.set(15.0 - halfW / 2, wallHeight + roofPeak / 2, 15.0);
    rightRoof.rotation.z = -roofAngle;
    presetGroup.add(rightRoof);
 
    for(let z = 3.75; z <= 27.0; z += 7.5) {
        createHangingLight(3.75, z, 6.25, 5.2);
        createHangingLight(7.5, z, 7.5, 5.2);
        createHangingLight(11.25, z, 6.25, 5.2);
    }
 
    camera.position.set(20, 20, 40);
    controls.target.set(7.5, 2.5, 15);
}
 
 
// --- UI LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const tabContents = document.querySelectorAll('#main-content .tab-content');
 
    function switchTab(tabId) {
        navLinks.forEach(navLink => {
            navLink.classList.remove('active');
            if (navLink.getAttribute('data-tab') === tabId) {
                navLink.classList.add('active');
            }
        });
        tabContents.forEach(tabContent => {
            tabContent.classList.remove('active');
            if (tabContent.id === tabId) {
                tabContent.classList.add('active');
            }
        });
 
        if (tabId === 'tab-3d') {
            setTimeout(() => {
                // Resize renderer theo kích thước thật của container
                const w = container.clientWidth || window.innerWidth - 260;
                const h = container.clientHeight || window.innerHeight - 56;
                renderer.setSize(w, h);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                window.dispatchEvent(new Event('resize'));
                if (!scene.getObjectByName('presetGroup')) {
                    loadMekongPreset();
                }
            }, 80);
        }
    }
 
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
    
    // Initial Load
    const initialTab = 'tab-dashboard';
    switchTab(initialTab);
});
 
 
// --- Floating Panel Logic ---
const settingsBtn = document.getElementById('btn-settings');
const closePanelBtn = document.getElementById('btn-close-panel');
const floatingPanel = document.getElementById('floating-panel');
const panelHeader = document.querySelector('.panel-header');
 
settingsBtn.addEventListener('click', () => {
    floatingPanel.style.display = 'flex';
});
 
closePanelBtn.addEventListener('click', () => {
    floatingPanel.style.display = 'none';
});
 
let isDragging = false;
let startX, startY, initialX, initialY;

// Hàm bắt đầu kéo (Hỗ trợ cả Chuột & Cảm ứng)
function startDrag(e) {
    if (e.target === closePanelBtn) return; // Bỏ qua nếu bấm trúng nút X
    isDragging = true;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    startX = clientX;
    startY = clientY;
    initialX = floatingPanel.offsetLeft;
    initialY = floatingPanel.offsetTop;
    panelHeader.style.cursor = 'grabbing';
}

// Hàm xử lý di chuyển
function drag(e) {
    if (!isDragging) return;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    const dx = clientX - startX;
    const dy = clientY - startY;
    floatingPanel.style.left = (initialX + dx) + 'px';
    floatingPanel.style.top = (initialY + dy) + 'px';
}

// Hàm kết thúc kéo
function endDrag() {
    isDragging = false;
    panelHeader.style.cursor = 'grab';
}

// Gắn sự kiện cho Máy tính (Mouse)
panelHeader.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', endDrag);

// Gắn sự kiện cho Điện thoại (Touch)
panelHeader.addEventListener('touchstart', startDrag, { passive: false });
document.addEventListener('touchmove', (e) => {
    if (isDragging) {
        e.preventDefault(); // Ngăn trình duyệt cuộn trang khi đang kéo bảng
        drag(e);
    }
}, { passive: false });
document.addEventListener('touchend', endDrag);
 
// Switch between 3D and 2D modes
const btn3d = document.getElementById('btn-mode-3d');
const btn2d = document.getElementById('btn-mode-2d');
const sceneContainer = document.getElementById('scene-container');
const mapContainer = document.getElementById('map-2d-container');
 
function showWarehouse3D() {
    document.getElementById('warehouse-splash').style.display = 'none';
    sceneContainer.style.display = 'block';
    mapContainer.style.display = 'none';
    axisContainer.style.display = 'block';
    btn3d.classList.add('active');
    btn2d.classList.remove('active');
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        if (!scene.getObjectByName('presetGroup')) {
            loadMekongPreset();
        }
        renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
        camera.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
        camera.updateProjectionMatrix();
    }, 80);
}

function showWarehouse2D() {
    document.getElementById('warehouse-splash').style.display = 'none';
    sceneContainer.style.display = 'none';
    mapContainer.style.display = 'flex';
    axisContainer.style.display = 'none';
    btn2d.classList.add('active');
    btn3d.classList.remove('active');
    window.dispatchEvent(new Event('resize'));
}

btn3d.addEventListener('click', showWarehouse3D);
btn2d.addEventListener('click', showWarehouse2D);

// Nút trên màn hình splash
document.getElementById('splash-btn-3d').addEventListener('click', showWarehouse3D);
document.getElementById('splash-btn-2d').addEventListener('click', showWarehouse2D);
 
// Collapsible sections
const collapsibles = document.querySelectorAll('.collapsible');
collapsibles.forEach(coll => {
coll.addEventListener('click', () => {
        coll.classList.toggle('active');
        const content = coll.nextElementSibling;
        if (content.style.maxHeight && content.style.maxHeight !== 'fit-content') {
            content.style.maxHeight = null;
        } else {
            content.style.maxHeight = content.scrollHeight + "px";
        }
    });
});
 
// ══════════════════════════════════════════════
// MODAL & CRUD MANAGEMENT LOGIC
// ══════════════════════════════════════════════
 
// --- Dữ liệu lưu trong bộ nhớ ---
const store = {
    employees: [],
    forklifts: [],
    skus: [],
    receipts: [],
    deliveries: []
};
 
// --- Tiện ích tạo ID ---
function genId(prefix) {
    return prefix + '-' + Date.now().toString().slice(-5);
}
 
// --- Mở / đóng modal ---
function openModal(id) {
    document.getElementById(id).classList.add('open');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}
 
// Gán nút đóng cho tất cả modal
document.querySelectorAll('.modal-close, .btn-secondary-outline[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
    });
});
 
// --- Set ngày mặc định cho các input date ---
function setTodayDate(...ids) {
    const today = new Date().toISOString().split('T')[0];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = today; });
}
 
// ══ NHÂN VIÊN ══
document.getElementById('btn-add-employee').addEventListener('click', () => {
    openModal('modal-employee');
});
 
document.getElementById('btn-save-employee').addEventListener('click', () => {
    const name   = document.getElementById('emp-name').value.trim();
    const role   = document.getElementById('emp-role').value.trim();
    const status = document.getElementById('emp-status').value;
    const tag    = document.getElementById('emp-tag').value.trim();
 
    if (!name || !role) { alert('Vui lòng nhập Tên và Chức vụ!'); return; }
 
    const emp = { id: genId('NV'), name, role, status, tag: tag || '—' };
    store.employees.push(emp);
    renderEmployees();
    closeModal('modal-employee');
 
    // Reset form
    ['emp-name','emp-role','emp-tag'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('emp-status').value = 'active';
});
 
function renderEmployees() {
    const tbody = document.getElementById('employee-tbody');
    const search = (document.getElementById('employee-search').value || '').toLowerCase();
    const rows = store.employees.filter(e =>
        e.name.toLowerCase().includes(search) || e.id.toLowerCase().includes(search)
    );
    tbody.innerHTML = rows.map(e => `
        <tr>
            <td>${e.id}</td>
            <td>${e.name}</td>
<td>${e.role}</td>
            <td><span class="status-badge ${e.status === 'active' ? 'status-active' : 'status-inactive'}">${e.status === 'active' ? 'Đang làm việc' : 'Nghỉ'}</span></td>
            <td>${e.tag}</td>
            <td>
                <button class="btn-row-action btn-row-delete" onclick="deleteItem('employees','${e.id}', renderEmployees)">Xóa</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px">Chưa có nhân viên nào</td></tr>';
}
 
document.getElementById('employee-search').addEventListener('input', renderEmployees);
 
// ══ XE NÂNG ══
document.getElementById('btn-add-forklift').addEventListener('click', () => {
    openModal('modal-forklift');
});
 
document.getElementById('btn-save-forklift').addEventListener('click', () => {
    const fid      = document.getElementById('fl-id').value.trim();
    const type     = document.getElementById('fl-type').value;
    const status   = document.getElementById('fl-status').value;
    const tag      = document.getElementById('fl-tag').value.trim();
    const location = document.getElementById('fl-location').value.trim();
 
    if (!fid) { alert('Vui lòng nhập ID xe nâng!'); return; }
 
    const fl = { id: fid, type, status, location: location || '—', tag: tag || '—' };
    store.forklifts.push(fl);
    renderForklifts();
    closeModal('modal-forklift');
 
    ['fl-id','fl-tag','fl-location'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fl-status').value = 'active';
});
 
function renderForklifts() {
    const tbody = document.getElementById('forklift-tbody');
    const search = (document.getElementById('forklift-search').value || '').toLowerCase();
    const rows = store.forklifts.filter(f =>
        f.id.toLowerCase().includes(search)
    );
    tbody.innerHTML = rows.map(f => `
        <tr>
            <td>${f.id}</td>
            <td>${f.type}</td>
            <td><span class="status-badge ${f.status === 'active' ? 'status-active' : 'status-inactive'}">${f.status === 'active' ? 'Hoạt động' : 'Bảo trì'}</span></td>
            <td>${f.location}</td>
            <td>${f.tag}</td>
            <td>
                <button class="btn-row-action btn-row-delete" onclick="deleteItem('forklifts','${f.id}', renderForklifts)">Xóa</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px">Chưa có xe nâng nào</td></tr>';
}
 
document.getElementById('forklift-search').addEventListener('input', renderForklifts);
 
// ══ SKU ══
// Cập nhật preview mã vị trí khi chọn dropdown
document.addEventListener('change', (e) => {
    if (['sku-loc-rack','sku-loc-tier','sku-loc-bay'].includes(e.target.id)) {
        const rack = document.getElementById('sku-loc-rack').value;
        const tier = document.getElementById('sku-loc-tier').value;
        const bay  = document.getElementById('sku-loc-bay').value;
        const preview = document.getElementById('sku-loc-preview');
        const locInput = document.getElementById('sku-location');
        if (rack && tier && bay) {
            const code = `R${rack}${tier}${bay}`;
            preview.textContent = code;
            locInput.value = code;
        } else {
            preview.textContent = 'Chưa chọn đủ';
            locInput.value = '';
        }
    }
});

document.getElementById('btn-add-sku').addEventListener('click', () => {
    openModal('modal-sku');
});
 
document.getElementById('btn-save-sku').addEventListener('click', () => {
    const code     = document.getElementById('sku-code').value.trim();
    const name     = document.getElementById('sku-name').value.trim();
    const unit     = document.getElementById('sku-unit').value.trim();
    const quantity = parseInt(document.getElementById('sku-qty').value) || 0;
    const price    = parseInt(document.getElementById('sku-price').value) || 0;
    const location = document.getElementById('sku-location').value.trim();
 
    if (!code || !name) { alert('Vui lòng nhập Mã SKU và Tên hàng hóa!'); return; }
    if (!location) { alert('Vui lòng chọn vị trí kho (Dãy kệ + Tầng + Bay)!'); return; }
 
    const sku = { code, name, unit: unit || '—', quantity, price, location };
    
    // Lưu vào boxesData để hệ thống picking nhận biết
    boxesData[code] = { 
        name, sku: code, quantity: stock,
        location, note: 'Thêm từ tab Quản lý hàng hóa'
    };

    // Vẽ lên 3D ngay lập tức
    renderDynamicBox(sku);

    renderSkus();
    closeModal('modal-sku');
 
    // Reset form
    ['sku-code','sku-name','sku-unit','sku-stock','sku-min-stock','sku-price','sku-location'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['sku-loc-rack','sku-loc-tier','sku-loc-bay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id === 'sku-loc-tier' ? '1' : (id === 'sku-loc-bay' ? '01' : '');
    });
    const preview = document.getElementById('sku-loc-preview');
    if (preview) preview.textContent = 'Chưa chọn';
});
 
function renderSkus() {
    const tbody  = document.getElementById('sku-tbody');
    const search = (document.getElementById('sku-search').value || '').toLowerCase();
    const filter = document.getElementById('sku-filter').value;
    let rows = store.skus.filter(s =>
        s.code.toLowerCase().includes(search) || s.name.toLowerCase().includes(search)
    );
    if (filter === 'low-stock') rows = rows.filter(s => s.quantity > 0 && s.quantity <= 10); // Mặc định cảnh báo nếu < 10
    if (filter === 'out-of-stock') rows = rows.filter(s => s.quantity === 0);

    const fmt = n => n.toLocaleString('vi-VN');
    tbody.innerHTML = rows.map(s => `
        <tr>
            <td style="text-align:center;"><input type="checkbox" class="cb-picking" value="${s.code}" data-name="${s.name}" style="transform: scale(1.2); cursor:pointer;"></td>
            <td>${s.code}</td>
            <td>${s.name}</td>
            <td>${s.unit}</td>
            <td>${fmt(s.quantity)}</td>
<td>${s.location}</td>
<td>${fmt(s.price)}</td>
<td>${fmt(s.quantity * s.price)}</td>
            <td>
                <button class="btn-row-action btn-row-delete" onclick="deleteItem('skus','${s.code}', renderSkus, 'code')">Xóa</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="10" style="text-align:center;color:#aaa;padding:24px">Chưa có hàng hóa nào</td></tr>';
    
    // Tự động chèn thêm Tiêu đề cột "Chọn" vào HTML nếu chưa có
    const theadRow = tbody.parentElement.querySelector('thead tr');
    if (theadRow && !theadRow.classList.contains('has-picking-col')) {
        theadRow.insertAdjacentHTML('afterbegin', '<th style="width: 45px; text-align: center;">Chọn</th>');
        theadRow.classList.add('has-picking-col');
    }
}
 
document.getElementById('sku-search').addEventListener('input', renderSkus);
document.getElementById('sku-filter').addEventListener('change', renderSkus);
 
// ══ PHIẾU NHẬP ══
document.getElementById('btn-create-receipt').addEventListener('click', () => {
    setTodayDate('rec-date');
    document.getElementById('rec-code').value = 'PN-' + new Date().getFullYear() + '-' + String(store.receipts.length + 1).padStart(3,'0');
    openModal('modal-receipt');
});
 
document.getElementById('btn-save-receipt').addEventListener('click', () => {
    const code     = document.getElementById('rec-code').value.trim();
    const date     = document.getElementById('rec-date').value;
    const supplier = document.getElementById('rec-supplier').value.trim();
    const status   = document.getElementById('rec-status').value;
    const value    = parseInt(document.getElementById('rec-value').value) || 0;
if (!code || !supplier) { alert('Vui lòng nhập Mã phiếu và Nhà cung cấp!'); return; }
 
    store.receipts.push({ code, date, supplier, status, value });
    renderReceipts();
    closeModal('modal-receipt');
 
    ['rec-code','rec-date','rec-supplier','rec-value'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('rec-status').value = 'pending';
});
 
function renderReceipts() {
    const tbody = document.getElementById('receipt-tbody');
    const fmt = n => n.toLocaleString('vi-VN');
    tbody.innerHTML = store.receipts.map(r => `
        <tr>
            <td>${r.code}</td>
            <td>${r.date}</td>
            <td>${r.supplier}</td>
            <td><span class="status-badge ${r.status === 'done' ? 'status-done' : 'status-pending'}">${r.status === 'done' ? 'Hoàn thành' : 'Chờ xử lý'}</span></td>
            <td>${fmt(r.value)} ₫</td>
            <td>
                <button class="btn-row-action btn-row-delete" onclick="deleteItem('receipts','${r.code}', renderReceipts, 'code')">Xóa</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px">Chưa có phiếu nhập nào</td></tr>';
}
 
// ══ PHIẾU XUẤT ══
document.getElementById('btn-create-delivery').addEventListener('click', () => {
    setTodayDate('del-date');
    document.getElementById('del-code').value = 'PX-' + new Date().getFullYear() + '-' + String(store.deliveries.length + 1).padStart(3,'0');
    openModal('modal-delivery');
});
 
document.getElementById('btn-save-delivery').addEventListener('click', () => {
    const code     = document.getElementById('del-code').value.trim();
    const date     = document.getElementById('del-date').value;
    const customer = document.getElementById('del-customer').value.trim();
    const status   = document.getElementById('del-status').value;
 
    if (!code || !customer) { alert('Vui lòng nhập Mã phiếu và Khách hàng!'); return; }
 
    store.deliveries.push({ code, date, customer, status });
    renderDeliveries();
    closeModal('modal-delivery');
 
    ['del-code','del-date','del-customer'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('del-status').value = 'pending';
});
 
function renderDeliveries() {
    const tbody = document.getElementById('delivery-tbody');
    tbody.innerHTML = store.deliveries.map(d => `
        <tr>
            <td>${d.code}</td>
            <td>${d.date}</td>
            <td>${d.customer}</td>
            <td><span class="status-badge ${d.status === 'done' ? 'status-done' : 'status-pending'}">${d.status === 'done' ? 'Hoàn thành' : 'Chờ xử lý'}</span></td>
            <td>
                <button class="btn-row-action btn-row-delete" onclick="deleteItem('deliveries','${d.code}', renderDeliveries, 'code')">Xóa</button>
            </td>
        </tr>
`).join('') || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:24px">Chưa có phiếu xuất nào</td></tr>';
}
 
// ══ XÓA ITEM ══
window.deleteItem = function(storeKey, id, renderFn, idField = 'id') {
    if (!confirm('Xác nhận xóa?')) return;
    store[storeKey] = store[storeKey].filter(item => item[idField] !== id);
    renderFn();
};
 
// Expose render functions to global scope for onclick handlers
window.renderEmployees = renderEmployees;
window.renderForklifts = renderForklifts;
window.renderSkus = renderSkus;
window.renderReceipts = renderReceipts;
window.renderDeliveries = renderDeliveries;

// ══════════════════════════════════════════════
// THÙNG HÀNG - POPUP & CRUD
// ══════════════════════════════════════════════

function openBoxPopup(boxId, clientX, clientY) {
    const box = boxesData[boxId] || {};
    const isAdmin = currentUserRole === 'admin';

    // Xóa popup cũ nếu có
    let old = document.getElementById('box-popup');
    if (old) old.remove();

    const popup = document.createElement('div');
    popup.id = 'box-popup';
    popup.style.cssText = `
    position: fixed; z-index: 9999;
    left: ${Math.min(clientX + 10, window.innerWidth - 320)}px;
    top: ${Math.min(clientY + 10, window.innerHeight - 380)}px;
    width: 280px; 
    max-height: 350px; 
    overflow-y: auto; 
    background: #fff;
    border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.22);
    padding: 16px 18px; font-family: 'Segoe UI', sans-serif;
    animation: popupIn .15s ease;
`;

    const fmt = v => v || '<span style="color:#aaa">Chưa có</span>';

    popup.innerHTML = `
        <style>
            @keyframes popupIn { from { transform: scale(.92); opacity:0; } to { transform: scale(1); opacity:1; } }
            #box-popup input, #box-popup textarea { width:100%; box-sizing:border-box; padding:6px 9px; border:1px solid #dee2e6; border-radius:5px; font-size:.85em; margin-top:3px; }
            #box-popup label { font-size:.78em; font-weight:600; color:#374151; display:block; margin-top:10px; }
            .box-badge { display:inline-block; background:#1e3a5f; color:#fff; padding:3px 10px; border-radius:20px; font-size:.75em; font-weight:700; margin-bottom:10px; }
            .popup-actions { display:flex; gap:8px; margin-top:14px; justify-content:flex-end; }
            .btn-popup { padding:7px 16px; border-radius:6px; border:none; cursor:pointer; font-size:.82em; font-weight:600; }
            .btn-popup-save { background:#111827; color:#fff; }
            .btn-popup-delete { background:#fee2e2; color:#dc2626; }
            .btn-popup-close { background:#f3f4f6; color:#374151; }
        </style>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
            <div>
                <div class="box-badge">📦 ${boxId}</div>
                <div style="font-size:.8em; color:#6b7280;">Thùng hàng trong kho</div>
            </div>
            <button class="btn-popup btn-popup-close" onclick="document.getElementById('box-popup').remove()" style="padding:4px 10px;">✕</button>
        </div>
        <hr style="border:none; border-top:1px solid #f0f0f0; margin:10px 0;">
        ${isAdmin ? `
            <label>Tên hàng hóa</label>
            <input id="bp-name" value="${box.name || ''}" placeholder="Tên hàng hóa">
            <label>Mã SKU</label>
            <input id="bp-sku" value="${box.sku || ''}" placeholder="SKU-00001">
            <label>Số lượng</label>
            <input id="bp-qty" type="number" value="${box.quantity || 0}" min="0">
            <label>Trọng lượng (kg)</label>
            <input id="bp-weight" type="number" value="${box.weight || 0}" min="0" step="0.1">
            <label>Vị trí trong kho</label>
            <input id="bp-loc" value="${box.location || ''}" placeholder="Kệ A1, Tầng 2...">
            <label>Ghi chú</label>
            <textarea id="bp-note" rows="2" placeholder="Ghi chú...">${box.note || ''}</textarea>
            <div class="popup-actions">
                <button class="btn-popup btn-popup-delete" onclick="deleteBox('${boxId}')">Xóa</button>
                <button class="btn-popup btn-popup-save" onclick="saveBox('${boxId}')">💾 Lưu</button>
            </div>
        ` : `
            <table style="width:100%; font-size:.85em; border-collapse:collapse;">
                <tr><td style="color:#6b7280; padding:4px 0; width:100px;">Tên hàng:</td><td>${fmt(box.name)}</td></tr>
                <tr><td style="color:#6b7280; padding:4px 0;">Mã SKU:</td><td>${fmt(box.sku)}</td></tr>
                <tr><td style="color:#6b7280; padding:4px 0;">Số lượng:</td><td>${box.quantity || 0}</td></tr>
                <tr><td style="color:#6b7280; padding:4px 0;">Trọng lượng:</td><td>${box.weight ? box.weight + ' kg' : '<span style="color:#aaa">Chưa có</span>'}</td></tr>
                <tr><td style="color:#6b7280; padding:4px 0;">Vị trí:</td><td>${fmt(box.location)}</td></tr>
                <tr><td style="color:#6b7280; padding:4px 0;">Ghi chú:</td><td>${fmt(box.note)}</td></tr>
            </table>
            <div class="popup-actions">
                <button class="btn-popup btn-popup-close" onclick="document.getElementById('box-popup').remove()">Đóng</button>
            </div>
        `}
    `;

    document.body.appendChild(popup);

    // Click ngoài để đóng
    setTimeout(() => {
        document.addEventListener('click', function closePopup(e) {
            if (!document.getElementById('box-popup')?.contains(e.target)) {
                document.getElementById('box-popup')?.remove();
                document.removeEventListener('click', closePopup);
            }
        });
    }, 100);
}

window.saveBox = async function(boxId) {
    const body = {
        boxId,
        name: document.getElementById('bp-name').value.trim(),
        sku: document.getElementById('bp-sku').value.trim(),
        quantity: parseFloat(document.getElementById('bp-qty').value) || 0,
        weight: parseFloat(document.getElementById('bp-weight').value) || 0,
        location: document.getElementById('bp-loc').value.trim(),
        note: document.getElementById('bp-note').value.trim(),
    };

    const existing = boxesData[boxId];
    const method = existing ? 'PUT' : 'POST';
    const url = existing ? `/api/boxes/${boxId}` : '/api/boxes';

    const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (res.ok) {
        const updated = await res.json();
        boxesData[boxId] = updated;
        document.getElementById('box-popup')?.remove();
        // Reload preset để cập nhật label
        const pg = scene.getObjectByName('presetGroup');
        if (pg) { scene.remove(pg); }
        boxMeshMap = [];
        loadMekongPreset();
        showToast(`✅ Đã lưu thông tin ${boxId}`);
    } else {
        const err = await res.json();
        alert('Lỗi: ' + err.error);
    }
};

window.deleteBox = async function(boxId) {
    if (!confirm(`Xóa thông tin thùng hàng ${boxId}?`)) return;
    await fetch(`/api/boxes/${boxId}`, { method: 'DELETE' });
    delete boxesData[boxId];
    document.getElementById('box-popup')?.remove();
    const pg = scene.getObjectByName('presetGroup');
    if (pg) { scene.remove(pg); }
    boxMeshMap = [];
    loadMekongPreset();
    showToast(`🗑️ Đã xóa thông tin ${boxId}`);
};

function showToast(msg) {
    let toast = document.getElementById('box-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'box-toast';
        toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#111827; color:#fff; padding:10px 20px; border-radius:8px; font-size:.85em; z-index:99999; transition:opacity .3s;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// Lắng nghe cập nhật realtime từ server
if (typeof io !== 'undefined') {
    const sock = io();
    sock.on('boxes_updated', (boxes) => {
        boxesData = {};
        boxes.forEach(b => { boxesData[b.boxId] = b; });
    });
}
// --- TÍNH NĂNG PICKING TÍCH HỢP TAB HÀNG HÓA ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Chèn giao diện Modal Confirm vào hệ thống
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal-picking" class="modal-overlay">
            <div class="modal-box" style="max-width: 480px;">
                <button class="modal-close" onclick="closeModal('modal-picking')">✕</button>
                <h3>🛒 Xác nhận danh sách Picking</h3>
                <div class="form-group">
                    <label>Mã Tag (Xe kéo/Nhân viên)</label>
                    <input type="text" id="picking-tag-id" placeholder="VD: TAG-001" value="TAG-001">
                    <small style="color:#6c757d;">(Hệ thống sẽ tạo một Tag giả ở khu vực cửa kho để test tính năng)</small>
                </div>
                <div class="form-group" style="margin-top: 10px;">
    <label>Chế độ hiển thị lộ trình</label>
    <select id="route-display-mode" style="width: 100%; padding: 8px; border-radius: 5px; border: 1px solid #dee2e6;">
        <option value="full">Hiển thị toàn bộ lộ trình</option>
        <option value="step">Hiển thị từng chặng (đến từng hàng hóa)</option>
    </select>
</div>
                <div class="form-group">
                    <label>Danh sách hàng hóa cần lấy</label>
                    <ul id="picking-confirm-list" style="list-style:none; padding:0; max-height: 220px; overflow-y:auto; border:1px solid #dee2e6; border-radius:5px; padding:10px; margin:0; background: #f8f9fa;">
                    </ul>
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary-outline" onclick="closeModal('modal-picking')">Hủy</button>
                    <button class="btn-primary" id="btn-confirm-picking" style="background: #10b981;">Tạo lộ trình 3D</button>
                </div>
            </div>
        </div>
    `);

    // 2. Chèn nút "Lên lộ trình Picking" vào kế bên nút Thêm SKU
    setTimeout(() => {
        const btnAddSku = document.getElementById('btn-add-sku');
        if (btnAddSku) {
            btnAddSku.insertAdjacentHTML('beforebegin', `<button class="btn-primary" id="btn-start-picking" style="background-color: #10b981; margin-right: 10px;"> Lên lộ trình Picking</button>`);
            
            // Xử lý sự kiện khi bấm nút Picking ở bảng
            document.getElementById('btn-start-picking').addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('.cb-picking:checked');
                window.selectedPickingItems = [];
                const listEl = document.getElementById('picking-confirm-list');
                listEl.innerHTML = '';

                if (checkboxes.length === 0) return alert('Vui lòng tick chọn ít nhất 1 hàng hóa trong bảng để Picking!');

                checkboxes.forEach(cb => {
                    window.selectedPickingItems.push(cb.value);
                    listEl.innerHTML += `
                        <li id="pick-item-${cb.value}" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
                            <span><b>${cb.value}</b> - ${cb.dataset.name}</span>
                            <button class="btn-row-action" onclick="removePickingItem('${cb.value}')" style="color:#dc2626; border-color:#fca5a5; padding:3px 8px;">Xóa</button>
                        </li>
                    `;
                });
                openModal('modal-picking');
            });
        }
    }, 500);

    // Hàm cho phép xóa hàng hóa ngay trong popup confirm
    window.removePickingItem = function(code) {
        document.getElementById('pick-item-' + code).remove();
        window.selectedPickingItems = window.selectedPickingItems.filter(i => i !== code);
        const cb = document.querySelector(`.cb-picking[value="${code}"]`);
        if(cb) cb.checked = false; // Xóa tick ở bảng ngoài
    };

    // 3. Xử lý thuật toán và Vẽ đường khi bấm Confirm
    document.getElementById('btn-confirm-picking').addEventListener('click', () => {
        if (window.selectedPickingItems.length === 0) return alert('Danh sách Picking đang trống!');

        const tagId = document.getElementById('picking-tag-id').value.trim();
        if (!tagId) return alert('Vui lòng nhập Tag ID!');

        // --- TẠO TỌA ĐỘ GIẢ CHO TAG ĐỂ TEST ---
        if (!tagDataStore[tagId]) {
            // Đặt xe kéo giả ở tọa độ X=2.0 (gần tường trái), Y=28.0 (gần cửa cuốn)
            tagDataStore[tagId] = { x: 2.0, y: 28.0, z: 0.5 }; 
            updateTags3D(tagDataStore); // Render cục tròn đỏ (Tag) lên không gian 3D
        }

        const tagPos = tagDataStore[tagId];
        // Điểm xuất phát bắt đầu từ tọa độ của Tag
        const startPoint = new THREE.Vector3(tagPos.x, tagPos.z || 0.5, tagPos.y); 

        let pointsToVisit = [startPoint];

        // Rút tọa độ 3D của các hàng hóa đã tick
        window.selectedPickingItems.forEach(targetCode => {
            const mappedObj = boxMeshMap.find(b => b.boxId === targetCode);
            if (mappedObj && mappedObj.mesh) {
                const pos = new THREE.Vector3();
                mappedObj.mesh.getWorldPosition(pos);
                pos.boxId = targetCode; // Gắn thêm ID để hiển thị thông báo từng chặng
                pointsToVisit.push(pos);
            }
        });

        if (pointsToVisit.length <= 1) {
            return alert("Không thể tính lộ trình! Vui lòng đảm bảo các hàng hóa đã chọn có Vị trí (VD: R1205) để hệ thống nhận diện trong 3D.");
        }

        window.isPickingMode = true;

        const SAFE_Z = 16.5; 
        const END_POINT = new THREE.Vector3(7.5, 0.5, 29.0);

        function getAisleX(x) { return x < 7.0 ? 4.4 : 11.0; }

        function getWalkingDist(p1, p2) {
            let a1 = getAisleX(p1.x), a2 = getAisleX(p2.x);
            if (p1.z >= SAFE_Z && p2.z >= SAFE_Z) return Math.abs(p1.x - p2.x) + Math.abs(p1.z - p2.z);
            let dist = Math.abs(p1.x - a1);
            if (a1 === a2) dist += Math.abs(p1.z - p2.z);
            else dist += Math.abs(p1.z - SAFE_Z) + Math.abs(a1 - a2) + Math.abs(p2.z - SAFE_Z);
            dist += Math.abs(p2.x - a2);
            return dist;
        }

        let orderedVisits = [pointsToVisit[0]];
        let unvisited = pointsToVisit.slice(1);
        let currentPos = pointsToVisit[0];

        while(unvisited.length > 0) {
            let nearestIdx = 0;
            let minDist = getWalkingDist(currentPos, unvisited[0]);
            for(let i = 1; i < unvisited.length; i++) {
                let dist = getWalkingDist(currentPos, unvisited[i]);
                if(dist < minDist) { minDist = dist; nearestIdx = i; }
            }
            currentPos = unvisited[nearestIdx];
            orderedVisits.push(currentPos);
            unvisited.splice(nearestIdx, 1);
        }
        orderedVisits.push(END_POINT);
        window.orderedVisits = orderedVisits; // Lưu lại để dùng cho việc highlight

        let curvePoints = [];
        const floorY = 0.15;
        let cPos = new THREE.Vector3(orderedVisits[0].x, floorY, orderedVisits[0].z);
        curvePoints.push(cPos.clone());

        for (let i = 1; i < orderedVisits.length; i++) {
            let pNext = orderedVisits[i];
            
            // TÁCH LÀN (Lanes): Thêm offset dựa trên số lượt để các đường song song nhau
            // Tạo ra 5 làn đường cách nhau 0.18m (-0.36, -0.18, 0, +0.18, +0.36)
            let laneOffsetX = ((i % 5) - 2) * 0.18; 
            let laneOffsetZ = ((i % 5) - 2) * 0.18; 
            
            let origA1 = getAisleX(cPos.x);
            let origA2 = getAisleX(pNext.x);

            let a1 = origA1 + laneOffsetX;
            let a2 = origA2 + laneOffsetX;
            let safeZ_curr = SAFE_Z + laneOffsetZ;

            // 1. Bước ra hành lang (theo lane của lượt này)
            if (Math.abs(cPos.x - a1) > 0.1) curvePoints.push(new THREE.Vector3(a1, floorY, cPos.z));

            // 2. Di chuyển đến điểm tiếp theo
            if (cPos.z >= SAFE_Z && pNext.z >= SAFE_Z) {
                // Nếu đang ở khu vực bãi đáp an toàn
                curvePoints.push(new THREE.Vector3(cPos.x, floorY, safeZ_curr));
                curvePoints.push(new THREE.Vector3(pNext.x, floorY, safeZ_curr));
            } else if (origA1 === origA2) {
                // Đi dọc cùng một làn
                curvePoints.push(new THREE.Vector3(a2, floorY, pNext.z));
            } else {
                // Đổi luồng (phải đi vòng qua SAFE_Z)
                curvePoints.push(new THREE.Vector3(a1, floorY, safeZ_curr));
                curvePoints.push(new THREE.Vector3(a2, floorY, safeZ_curr));
                curvePoints.push(new THREE.Vector3(a2, floorY, pNext.z));
            }

            // 3. Rẽ vào đúng điểm lấy hàng
            curvePoints.push(new THREE.Vector3(pNext.x, floorY, pNext.z));
            // KHÔNG TRÈO LÊN KỆ: Đã xóa dòng đẩy tọa độ Y lên cao
            
            if (i < orderedVisits.length - 1) {
                curvePoints.push(new THREE.Vector3(pNext.x + 0.15, floorY, pNext.z));
                cPos = new THREE.Vector3(pNext.x + 0.15, floorY, pNext.z);
            }
        }
        // Lọc bỏ các điểm dính sát nhau để tránh xoắn ống 3D
        let finalCurve = [curvePoints[0]];
        for(let i = 1; i < curvePoints.length; i++) {
            if(curvePoints[i].distanceTo(finalCurve[finalCurve.length-1]) > 0.05) {
                finalCurve.push(curvePoints[i]);
            }
        }
        window.currentRoutePoints = finalCurve;

        // 1. TÌM VỊ TRÍ CHÍNH XÁC (INDEX) CỦA CÁC ĐIỂM DỪNG TRÊN ĐƯỜNG CONG
        window.routeStopIndices = [];
        orderedVisits.forEach((visit, index) => {
            if (index === 0) return; // Bỏ qua điểm xuất phát
            let minD = Infinity;
            let bestIdx = 0;
            finalCurve.forEach((pt, idx) => {
                let d = pt.distanceTo(visit);
                if (d < minD) { minD = d; bestIdx = idx; }
            });
            window.routeStopIndices.push(bestIdx);
        });

// 2. TẠO TEXTURE NÉT ĐỨT (GIỐNG 2D)
const dashCanvas = document.createElement('canvas');
dashCanvas.width = 128; dashCanvas.height = 64;
const dCtx = dashCanvas.getContext('2d');

// Vẽ nét đứt: một nửa tô màu xanh ngọc, một nửa để trong suốt
dCtx.fillStyle = '#10b981';
dCtx.fillRect(0, 0, 64, 64); 

const routeTex = new THREE.CanvasTexture(dashCanvas);
routeTex.wrapS = THREE.RepeatWrapping;
routeTex.wrapT = THREE.RepeatWrapping;
window.routeTexture = routeTex;
        
        window.currentRouteStep = 0;

        // 3. HÀM RENDER ĐƯỜNG ĐI ĐỘNG DỰA TRÊN CHẾ ĐỘ
        window.updateRouteDisplay = function() {
            if (!window.currentRoutePoints || window.currentRoutePoints.length < 2) return;
            
            const displayMode = document.getElementById('route-display-mode-3d').value;
            const btnNextStep = document.getElementById('btn-next-route-step');
            
            if (window.currentRouteLine) scene.remove(window.currentRouteLine);
            
            let pointsToDraw = [];

            if (displayMode === 'full') {
                pointsToDraw = window.currentRoutePoints;
                btnNextStep.style.display = 'none';
            } else {
                btnNextStep.style.display = 'block';
                let startIdx = window.currentRouteStep === 0 ? 0 : window.routeStopIndices[window.currentRouteStep - 1];
                let endIdx = window.routeStopIndices[window.currentRouteStep];

                if (endIdx === undefined) {
                    pointsToDraw = window.currentRoutePoints; 
                    btnNextStep.style.display = 'none';
                } else {
                    pointsToDraw = window.currentRoutePoints.slice(startIdx, endIdx + 1);
                }
            }

            // --- LÀM TỐI/XÓA PHÁT SÁNG CÁC HÀNG HÓA CŨ ---
            boxMeshMap.forEach(item => {
                if (item.mesh && item.mesh.material) {
                    if (Array.isArray(item.mesh.material)) {
                        item.mesh.material.forEach(m => { if(m.emissive) m.emissive.setHex(0x000000); });
                    } else if (item.mesh.material.emissive) {
                        item.mesh.material.emissive.setHex(0x000000);
                    }
                }
            });

          // --- LÀM SÁNG HÀNG HÓA MỤC TIÊU HIỆN TẠI ---
          if (displayMode === 'step' && window.routeStopIndices[window.currentRouteStep] !== undefined) {
            const nextTargetId = window.orderedVisits[window.currentRouteStep + 1]?.boxId;
                const targetObj = boxMeshMap.find(b => b.boxId === nextTargetId);
                if (targetObj && targetObj.mesh) {
                    const highlightColor = 0x44ff44; // Phát sáng màu xanh lá nhạt, nổi bật
                    if (Array.isArray(targetObj.mesh.material)) {
                        targetObj.mesh.material.forEach(m => { if(m.emissive) m.emissive.setHex(highlightColor); });
                    } else if (targetObj.mesh.material.emissive) {
                        targetObj.mesh.material.emissive.setHex(highlightColor);
                    }
                }
            }

            if (pointsToDraw.length < 2) return;

            const pathCurve = new THREE.CatmullRomCurve3(pointsToDraw, false, 'catmullrom', 0);
            const pathLength = pathCurve.getLength();
            
            // Tăng mật độ lặp để các nét đứt trông nhỏ gọn và sắc nét hơn
            window.routeTexture.repeat.set(Math.max(1, Math.floor(pathLength * 2.5)), 1); 

            const routeMat = new THREE.MeshBasicMaterial({ 
                map: window.routeTexture, 
                transparent: true, 
                opacity: 0.85, // Làm mờ nhẹ để tạo cảm giác giống vết sơn hoặc băng keo dán sàn
                side: THREE.DoubleSide 
            });
            
            // Giảm bán kính xuống 0.05 (thay vì 0.1) -> Bề rộng vạch kẻ sẽ khoảng 10cm, rất thực tế
            const routeGeo = new THREE.TubeGeometry(pathCurve, Math.floor(pathLength * 8) || 10, 0.05, 4, false);
            
            window.currentRouteLine = new THREE.Mesh(routeGeo, routeMat);
            
            // Ép phẳng đường ống theo trục Y (xuống còn 0.01) để nó dẹp xuống thành mặt phẳng
            window.currentRouteLine.scale.set(1, 0.01, 1);
            
            // Hạ thấp dải băng này xuống sát mép mặt sàn (để không bị lơ lửng)
            window.currentRouteLine.position.y = 0.1; 
            
            scene.add(window.currentRouteLine);
        };

        // 4. ĐỒNG BỘ NÚT CHỌN CHẾ ĐỘ 3D
        const modeSelector = document.getElementById('route-display-mode-3d');
        if (!modeSelector.hasAttribute('data-bound')) {
            modeSelector.addEventListener('change', () => {
                window.currentRouteStep = 0; // Reset lại từ đầu khi đổi chế độ
                window.updateRouteDisplay();
            });
            modeSelector.setAttribute('data-bound', 'true');
        }

        // Kế thừa lựa chọn từ Modal sang UI 3D
        const modalMode = document.getElementById('route-display-mode').value;
        modeSelector.value = modalMode;

        // 5. CÀI ĐẶT SỰ KIỆN NÚT "NEXT STEP" (Dùng cloneNode để tránh lặp sự kiện)
        const oldBtn = document.getElementById('btn-next-route-step');
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);

        newBtn.addEventListener('click', function() {
            if (window.currentRouteStep < window.routeStopIndices.length - 1) {
                window.currentRouteStep++;
                window.updateRouteDisplay();
                
                const nextItem = orderedVisits[window.currentRouteStep].boxId;
                const itemLabel = nextItem ? `mã ${nextItem}` : 'hàng hóa tiếp theo';
                showToast(`Đã tới điểm! Đang di chuyển đến ${itemLabel}...`);
            } else {
                window.currentRouteStep++;
                window.updateRouteDisplay();
                showToast("🏁 Đã đến điểm cuối cùng (Cổng ra)!");
                this.style.display = 'none';
            }
        });

        // Kích hoạt render lần đầu tiên
        window.updateRouteDisplay();

        // Đóng modal và chuyển sang Không gian 3D
        closeModal('modal-picking');
        document.querySelector('[data-tab="tab-3d"]').click();
        
        showToast(`✅ Đã lập lộ trình Picking cho ${tagId}`);
        // Hiện pop-up chữ nhỏ báo thành công
        showToast(`✅ Đã lập lộ trình Picking cho ${tagId}`);
    });
});
function renderDynamicBox(sku) {
    const loc = (sku.location || '').trim().toUpperCase();
    const match = loc.match(/^R([1-4])([1-3])(\d{2})$/);
    if (!match) {
        console.warn(`SKU ${sku.code}: location "${sku.location}" không đúng định dạng R[1-4][1-3][01-12]`);
        return;
    }

    const rackIdx = parseInt(match[1]);
    const tierIdx = parseInt(match[2]);
    const bayIdx  = parseInt(match[3]);
    if (bayIdx < 1 || bayIdx > 12) return;

    const j = bayIdx - 1;
    let X, Y, Z, boxGeo;

    if (rackIdx === 1 || rackIdx === 2) {
        X = rackIdx === 1 ? 2.4 : 6.4;
        const blockIndex = Math.floor(j / 4);
        const localJ = j % 4;
        Z = 1.9 + blockIndex * 4.3 + localJ * 1.0;
        const tierY = (2.8 * 0.15) + (tierIdx - 1) * 0.98;
        Y = tierY + 0.025 + (0.637 / 2);
        boxGeo = new THREE.BoxGeometry(0.75, 0.637, 0.8);
    } else {
        X = rackIdx === 3 ? 7.5 : 14.5;
        Z = 1.1 + j * 1.2;
        const tierY = (3.0 * 0.15) + (tierIdx - 1) * 1.05;
        Y = tierY + 0.025 + (0.6825 / 2);
        boxGeo = new THREE.BoxGeometry(0.75, 0.6825, 0.96);
    }

// Xóa phần tạo texture label, chỉ dùng màu trơn cho các mặt
const mats = [
    new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }), // Mặt trước đổi thành màu trơn
    new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }),
];

    const boxMesh = new THREE.Mesh(boxGeo, mats);
    boxMesh.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: 0x5c4033 })
    ));
    boxMesh.position.set(X, Y, Z);
    boxMesh.userData = { isBox: true, boxId: sku.code };

    // Thêm vào dynamicBoxGroup
    let dynGroup = scene.getObjectByName('dynamicBoxGroup');
    if (!dynGroup) {
        dynGroup = new THREE.Group();
        dynGroup.name = 'dynamicBoxGroup';
        scene.add(dynGroup);
    }
    dynGroup.add(boxMesh);
    boxMeshMap.push({ mesh: boxMesh, boxId: sku.code });

    // Nếu đang ở tab 3D thì hiện thông báo
    if (document.getElementById('tab-3d').classList.contains('active')) {
        showToast(`📦 Đã thêm ${sku.code} vào kệ ${loc}`);
    }
}
// ══════════════════════════════════════════════
// PICKING ROUTE TAB — A* + TSP
// ══════════════════════════════════════════════

const PK = {
    COLS: 32, ROWS: 62, CELL: 0.5,
    // Entry = cổng vào phía trước giữa kho
    ENTRY: { col: 15, row: 59, label: 'Cổng vào' }
};

// Xây grid chướng ngại vật dựa theo loadMekongPreset
function buildPickingGrid() {
    const g = Array.from({ length: PK.ROWS }, () => new Array(PK.COLS).fill(0));
    // Tường biên
    for (let r = 0; r < PK.ROWS; r++) { g[r][0] = 1; g[r][PK.COLS-1] = 1; }
    for (let c = 0; c < PK.COLS; c++) { g[0][c] = 1; g[PK.ROWS-1][c] = 1; }
    // Kệ R1 (x≈2.4): col 4-5, rows 3–24 (từng block 3.4+i*4.3)
    [[3,10],[12,19],[21,28]].forEach(([rs,re]) => {
        for (let r = rs; r <= re; r++) { g[r][4] = 1; g[r][5] = 1; }
    });
    // Kệ R2 (x≈6.4): col 12-13
    [[3,10],[12,19],[21,28]].forEach(([rs,re]) => {
        for (let r = rs; r <= re; r++) { g[r][12] = 1; g[r][13] = 1; }
    });
    // Kệ R3/RA (x=7.5): col 14-16, rows 15–44
    for (let r = 15; r <= 44; r++) { g[r][14] = 1; g[r][15] = 1; g[r][16] = 1; }
    // Kệ R4/RB (x=14.5): col 28-30
    for (let r = 15; r <= 44; r++) { g[r][28] = 1; g[r][29] = 1; g[r][30] = 1; }
    return g;
}
const pickingGrid = buildPickingGrid();

// A* Pathfinding
function astarPK(grid, start, end) {
    const R = grid.length, C = grid[0].length;
    const key = (r,c) => r * C + c;
    const h = (r,c) => Math.abs(r-end.row)*1.001 + Math.abs(c-end.col)*1.001;
    const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

    const open = new Map();
    const gS = {}, fS = {}, from = {};
    const sk = key(start.row, start.col);
    gS[sk] = 0; fS[sk] = h(start.row, start.col);
    open.set(sk, start);

    while (open.size > 0) {
        let cur = null, ck = null, mf = Infinity;
        for (const [k,n] of open) { const f = fS[k] ?? Infinity; if (f < mf) { mf = f; cur = n; ck = k; } }
        open.delete(ck);
        if (cur.row === end.row && cur.col === end.col) {
            const path = [];
            let k = ck;
            while (from[k] !== undefined) {
                path.unshift({ row: Math.floor(k/C), col: k%C });
                k = from[k];
            }
            path.unshift(start);
            return path;
        }
        for (const [dr,dc] of DIRS) {
            const nr = cur.row+dr, nc = cur.col+dc;
            if (nr<0||nr>=R||nc<0||nc>=C||grid[nr][nc]===1) continue;
            if (dr!==0&&dc!==0&&(grid[cur.row+dr][cur.col]===1||grid[cur.row][cur.col+dc]===1)) continue;
            const tg = (gS[ck]??Infinity) + (dr!==0&&dc!==0?1.414:1);
            const nk = key(nr,nc);
            if (tg < (gS[nk]??Infinity)) {
                from[nk] = ck; gS[nk] = tg; fS[nk] = tg + h(nr,nc);
                open.set(nk, { row:nr, col:nc });
            }
        }
    }
    return null;
}

// TSP Nearest Neighbor
function tspNN(pts, startIdx) {
    const n = pts.length, vis = new Array(n).fill(false), tour = [startIdx];
    vis[startIdx] = true;
    for (let s = 1; s < n; s++) {
        const cur = tour[tour.length-1];
        let best = -1, bd = Infinity;
        for (let i = 0; i < n; i++) {
            if (vis[i]) continue;
            const dr = pts[i].row - pts[cur].row, dc = pts[i].col - pts[cur].col;
            const d = Math.sqrt(dr*dr+dc*dc);
            if (d < bd) { bd = d; best = i; }
        }
        if (best === -1) break;
        tour.push(best); vis[best] = true;
    }
    return tour;
}

// Lấy grid pos của box
function getPickGridPos(boxId) {
    let match = boxId.match(/^(RA|RB)-B(\d+)T(\d+)$/);
    if (match) {
        const rack = match[1], bay = parseInt(match[2]);
        const baseZ = 7.7 + (bay-1)*1.2 + 0.6;
        const baseX = rack==='RA' ? 7.5 : 14.5;
        const col = Math.round(baseX/PK.CELL);
        const row = Math.round(baseZ/PK.CELL);
        const pickCol = rack==='RA' ? col-3 : col+3;
        return { col: Math.max(1,Math.min(PK.COLS-2,pickCol)), row: Math.max(1,Math.min(PK.ROWS-2,row)), label: boxId };
    }
    // SKU với location dạng R3xx
    match = boxId.match(/^R([1-4])([1-3])(\d{2})$/);
    if (match) {
        const ri = parseInt(match[1]), bay = parseInt(match[3]);
        let baseX, baseZ;
        if (ri===1) { baseX=2.4; baseZ=1.9+Math.floor((bay-1)/4)*4.3+(bay-1)%4*1.0; }
        else if (ri===2) { baseX=6.4; baseZ=1.9+Math.floor((bay-1)/4)*4.3+(bay-1)%4*1.0; }
        else if (ri===3) { baseX=7.5; baseZ=1.1+(bay-1)*1.2; }
        else { baseX=14.5; baseZ=1.1+(bay-1)*1.2; }
        const col = Math.round(baseX/PK.CELL);
        const row = Math.round(baseZ/PK.CELL);
        const pickCol = (ri===1||ri===2) ? col+2 : (ri===3 ? col-2 : col+2);
        return { col: Math.max(1,Math.min(PK.COLS-2,pickCol)), row: Math.max(1,Math.min(PK.ROWS-2,row)), label: boxId };
    }
    return null;
}

// ─── STATE ───
let pickSel = new Set();
let pickInitDone = false;

function initPickingTab() {
    if (!pickInitDone) {
        document.getElementById('picking-search')?.addEventListener('input', renderPickList);
        document.getElementById('btn-run-picking')?.addEventListener('click', runPicking);
        pickInitDone = true;
    }
    renderPickList();
    drawPickMap();
}

// Tổng hợp tất cả box có thể pick: từ boxMeshMap + store.skus có location
function getAllPickableItems() {
    const items = [];
    const seen = new Set();

    // Box từ kệ preset (RA/RB)
    for (let bay=1; bay<=12; bay++) {
        for (let tier=1; tier<=3; tier++) {
            ['RA','RB'].forEach(rack => {
                const id = `${rack}-B${bay}T${tier}`;
                if (!seen.has(id)) {
                    seen.add(id);
                    const info = boxesData[id] || {};
                    items.push({ id, name: info.name||'', sku: info.sku||'', qty: info.quantity||0 });
                }
            });
        }
    }

    // SKU từ store có location
    (store.skus||[]).forEach(s => {
        if (s.location && s.location.match(/^R[1-4][1-3]\d{2}$/) && !seen.has(s.code)) {
            seen.add(s.code);
            items.push({ id: s.code, name: s.name||'', sku: s.code, qty: s.stock||0 });
        }
    });

    return items;
}

function renderPickList() {
    const search = (document.getElementById('picking-search')?.value||'').toLowerCase();
    const items = getAllPickableItems().filter(i =>
        i.id.toLowerCase().includes(search) || i.name.toLowerCase().includes(search) || i.sku.toLowerCase().includes(search)
    );
    const el = document.getElementById('picking-box-list');
    if (!el) return;
    el.innerHTML = items.length ? items.map(i => `
        <div class="pick-item ${pickSel.has(i.id)?'selected':''}" onclick="togglePick('${i.id}')">
            <input type="checkbox" ${pickSel.has(i.id)?'checked':''} onclick="event.stopPropagation();togglePick('${i.id}')">
            <span class="pick-badge">${i.id}</span>
            <span style="flex:1;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i.name||'<span style="color:#aaa">Chưa đặt tên</span>'}</span>
            <span style="color:#6b7280;font-size:.73em;">SL:${i.qty}</span>
        </div>`).join('')
    : '<div style="color:#aaa;font-size:.82em;padding:8px;">Không tìm thấy hàng hóa</div>';
    renderPickSelected();
}

window.togglePick = function(id) {
    pickSel.has(id) ? pickSel.delete(id) : pickSel.add(id);
    renderPickList();
};

function renderPickSelected() {
    const el = document.getElementById('picking-selected-list');
    const cnt = document.getElementById('picking-count');
    if (!el) return;
    cnt.textContent = pickSel.size;
    el.innerHTML = [...pickSel].map(id => {
        const info = boxesData[id] || (store.skus||[]).find(s=>s.code===id) || {};
        const name = info.name || info.code || id;
        return `<div class="pick-sel-item">
            <span><b>${id}</b>${name&&name!==id?' — '+name:''}</span>
            <button onclick="togglePick('${id}')" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:1em;padding:0 4px;">✕</button>
        </div>`;
    }).join('') || '<div style="color:#aaa;font-size:.8em;padding:4px;">Chưa chọn hàng nào</div>';
}

// Vẽ bản đồ kho lên canvas
function drawPickMap(fullPath, allPts, tour) {
    const canvas = document.getElementById('picking-canvas');
    if (!canvas) return;
    const par = canvas.parentElement;
    const W = par.clientWidth || 600;
    const H = Math.max(300, (par.clientHeight||500) - 120);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const sx = W/PK.COLS, sy = H/PK.ROWS;

    // Nền
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0,0,W,H);

    // Grid + obstacles
    for (let r=0; r<PK.ROWS; r++) {
        for (let c=0; c<PK.COLS; c++) {
            if (pickingGrid[r][c]===1) {
                ctx.fillStyle = '#334155';
                ctx.fillRect(c*sx, r*sy, sx, sy);
            }
        }
    }

    // Nhãn kệ
    ctx.fillStyle = 'rgba(255,102,0,0.7)';
    ctx.font = `bold ${Math.max(7,sx*0.9)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let bay=1; bay<=12; bay++) {
        const posA = getPickGridPos(`RA-B${bay}T1`);
        const posB = getPickGridPos(`RB-B${bay}T1`);
        if (posA) ctx.fillText(`A${bay}`, 14*sx, posA.row*sy);
        if (posB) ctx.fillText(`B${bay}`, 30*sx, posB.row*sy);
    }
    ctx.fillStyle = '#94a3b8'; ctx.font = `bold ${Math.max(8,sx)}px sans-serif`;
    ctx.fillText('Kệ RA', 14*sx, 13*sy);
    ctx.fillText('Kệ RB', 30*sx, 13*sy);

    // Vẽ lộ trình A*
    if (fullPath && fullPath.length>1) {
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2;
        ctx.setLineDash([4,2]); ctx.shadowColor = '#facc15'; ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.moveTo(fullPath[0].col*sx + sx/2, fullPath[0].row*sy + sy/2);
        for (let i=1; i<fullPath.length; i++) ctx.lineTo(fullPath[i].col*sx+sx/2, fullPath[i].row*sy+sy/2);
        ctx.stroke();
        ctx.setLineDash([]); ctx.shadowBlur = 0;
    }

    // Entry point
    const ex = PK.ENTRY.col*sx+sx/2, ey = PK.ENTRY.row*sy+sy/2, er = Math.max(6,sx*0.8);
    ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(ex,ey,er,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font=`bold ${Math.max(7,er*0.8)}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('S',ex,ey);

    // Điểm lấy hàng
    if (allPts && tour) {
        const COLORS = ['#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316'];
        allPts.forEach((pt,idx) => {
            if (idx===0) return; // bỏ entry, đã vẽ trên
            const orderIdx = tour.indexOf(idx);
            const color = COLORS[(idx-1)%COLORS.length];
            const x = pt.col*sx+sx/2, y = pt.row*sy+sy/2, r = Math.max(6,sx*0.8);
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#fff'; ctx.font=`bold ${Math.max(7,r*0.8)}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(String(orderIdx),x,y);
            ctx.fillStyle = color; ctx.font=`${Math.max(6,sx*0.6)}px monospace`; ctx.textAlign='center';
            ctx.fillText(pt.label, x, y-r-3);
        });
    }
}

function runPicking() {
    if (pickSel.size===0) { alert('Chọn ít nhất 1 thùng hàng!'); return; }

    const targets = [];
    for (const id of pickSel) {
        const pos = getPickGridPos(id);
        if (pos) targets.push({ ...pos, boxId: id });
    }
    if (targets.length===0) { alert('Không xác định được vị trí hàng hóa trong kho!'); return; }

    const allPts = [PK.ENTRY, ...targets];

    // TSP: sắp xếp thứ tự tối ưu
    const tour = tspNN(allPts, 0);

    // A*: tính đường đi theo thứ tự tour
    const fullPath = [];
    const segs = [];
    for (let i=0; i<tour.length-1; i++) {
        const from = allPts[tour[i]], to = allPts[tour[i+1]];
        const seg = astarPK(pickingGrid, from, to);
        if (seg) {
            segs.push({ fromIdx: tour[i], toIdx: tour[i+1], path: seg, dist: seg.length });
            fullPath.push(...(i===0 ? seg : seg.slice(1)));
        }
    }
    // Đường về entry
    const last = allPts[tour[tour.length-1]];
    const retSeg = astarPK(pickingGrid, last, PK.ENTRY);
    if (retSeg) {
        segs.push({ fromIdx: tour[tour.length-1], toIdx: 0, path: retSeg, dist: retSeg.length });
        fullPath.push(...retSeg.slice(1));
    }

    drawPickMap(fullPath, allPts, tour);
    renderPickSteps(tour, allPts, segs);

    // Đồng thời vẽ lên 3D
    drawRoute3D(tour, allPts);
}

function drawRoute3D(tour, allPts) {
    if (typeof scene === 'undefined') return;
    if (window.currentRouteLine) scene.remove(window.currentRouteLine);
    const pts3D = [];
    const floorY = 0.3;
    tour.forEach((ptIdx, i) => {
        const pt = allPts[ptIdx];
        const wx = pt.col * PK.CELL;
        const wz = pt.row * PK.CELL;
        if (i===0) pts3D.push(new THREE.Vector3(wx, floorY, wz));
        pts3D.push(new THREE.Vector3(wx, floorY, wz));
    });
    // Về entry
    pts3D.push(new THREE.Vector3(PK.ENTRY.col*PK.CELL, floorY, PK.ENTRY.row*PK.CELL));

    const geo = new THREE.BufferGeometry().setFromPoints(pts3D);
    const mat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 4 });
    window.currentRouteLine = new THREE.Line(geo, mat);
    scene.add(window.currentRouteLine);
}

function renderPickSteps(tour, allPts, segs) {
    const el = document.getElementById('picking-steps');
    const statsEl = document.getElementById('picking-stats');
    if (!el) return;

    let totalCells = segs.reduce((s,sg) => s + (sg.dist||0), 0);
    const totalDist = (totalCells * PK.CELL).toFixed(1);
    const estMin = Math.ceil(totalCells * PK.CELL / 1.2 / 60);

    const steps = tour.map((ptIdx, i) => {
        const pt = allPts[ptIdx];
        const isEntry = ptIdx===0;
        const info = isEntry ? null : (boxesData[pt.boxId] || (store.skus||[]).find(s=>s.code===pt.boxId) || {});
        const segDist = segs[i] ? (segs[i].dist*PK.CELL).toFixed(1) : '?';
        const cls = i===0?'step-entry':'';
        return `<div class="picking-step">
            <div class="step-num ${cls}">${i+1}</div>
            <div>
                <b>${isEntry?' Cổng vào — Điểm xuất phát':` ${pt.boxId}`}</b><br>
                ${!isEntry?`<span style="color:#6b7280;">${info.name||info.code||'Chưa đặt tên'} — SL: ${info.quantity||info.stock||0}</span>`:''}
                ${i>0&&segs[i-1]?`<span style="color:#9ca3af;font-size:.73em;"> · ${(segs[i-1].dist*PK.CELL).toFixed(1)}m tới đây</span>`:''}
            </div>
        </div>`;
    });
    const lastSeg = segs[segs.length-1];
    steps.push(`<div class="picking-step">
        <div class="step-num step-last">${tour.length+1}</div>
        <div><b> Quay về Cổng vào</b>${lastSeg?`<span style="color:#9ca3af;font-size:.73em;"> · ${(lastSeg.dist*PK.CELL).toFixed(1)}m</span>`:''}</div>
    </div>`);

    el.innerHTML = steps.join('');
    statsEl.innerHTML = `
        <span>Tổng: <b>${totalDist}m</b></span>
        <span>~<b>${estMin} phút</b></span>
        <span> <b>${tour.length-1}</b> điểm</span>
    `;
    document.getElementById('picking-result').style.display = 'block';
}

// Hook vào switchTab để init picking khi mở tab
const _origSwitchTab = typeof switchTab === 'function' ? switchTab : null;
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-tab="tab-picking"]').forEach(link => {
        link.addEventListener('click', () => {
            setTimeout(initPickingTab, 80);
        });
    });
});
// ══ SPAWN THÙNG HÀNG NGẪU NHIÊN ══
const DEMO_ITEMS = [
    { name: 'Hộp bu lông M8',      sku: 'SKU-BLM8'  },
    { name: 'Ốc vít inox M6',      sku: 'SKU-OVM6'  },
    { name: 'Dây cáp điện 2.5mm',  sku: 'SKU-CAP25' },
    { name: 'Kẹp cáp nhựa',        sku: 'SKU-KCP'   },
    { name: 'Băng keo cách điện',   sku: 'SKU-BKCD'  },
    { name: 'Vòng đệm cao su',      sku: 'SKU-VDCS'  },
    { name: 'Đầu nối RJ45',         sku: 'SKU-RJ45'  },
    { name: 'Ống luồn dây',         sku: 'SKU-OLD'   },
    { name: 'Cầu chì 10A',          sku: 'SKU-CC10'  },
    { name: 'Relay 24VDC',          sku: 'SKU-R24'   },
    { name: 'Contactor 16A',        sku: 'SKU-CON16' },
    { name: 'Dây thít nhựa',        sku: 'SKU-DTN'   },
];

function spawnRandomBoxes() {
    const racks = ['1','2','3','4'];
    const tiers = ['1','2','3'];
    const used  = new Set();

    // 1. Xóa sạch dữ liệu demo cũ trong mảng store và object dữ liệu
    store.skus = store.skus.filter(s => !s._demo);
    Object.keys(boxesData).forEach(key => {
        if (boxesData[key]._demo) delete boxesData[key];
    });

    // 2. Xóa các mesh demo trên 3D và đồng bộ lại boxMeshMap
    let dynGroup = scene.getObjectByName('dynamicBoxGroup');
    if (dynGroup) {
        const toRemove = [];
        dynGroup.children.forEach(obj => { if (obj.userData._demo) toRemove.push(obj); });
        toRemove.forEach(obj => dynGroup.remove(obj));
    }
    boxMeshMap = boxMeshMap.filter(b => !b.mesh.userData._demo);

    const items = [...DEMO_ITEMS].sort(() => Math.random() - 0.5);
    const count = 6 + Math.floor(Math.random() * 5);

    for (let i = 0; i < Math.min(count, items.length); i++) {
        let loc;
        let tries = 0;
        do {
            const r = racks[Math.floor(Math.random() * racks.length)];
            const t = tiers[Math.floor(Math.random() * tiers.length)];
            const b = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
            loc = `R${r}${t}${b}`;
            tries++;
        } while (used.has(loc) && tries < 50);
        
        if (used.has(loc)) continue;
        used.add(loc);

        const item = items[i];
        // Kiểm tra nếu SKU đã tồn tại trong kho thật thì bỏ qua để tránh lặp
        if (store.skus.some(s => s.code === item.sku)) continue;

        const sku = {
            code:     item.sku,
            name:     item.name,
            unit:     'Thùng',
            quantity: Math.floor(Math.random() * 50) + 5,
            price:    (Math.floor(Math.random() * 90) + 10) * 1000,
            location: loc,
            _demo:    true // Đánh dấu là hàng demo
        };

        store.skus.push(sku);
        boxesData[sku.code] = { ...sku, note: 'Demo tự động' };

        renderDynamicBox(sku);
    }

    if (typeof renderSkus === 'function') renderSkus();
    showToast(`✅ Đã làm mới ${used.size} hàng hóa demo`);
}

// Thêm nút Spawn vào header tab Quản lý hàng hóa (SKU)
document.addEventListener('DOMContentLoaded', () => {
    const headerSku = document.querySelector('#tab-sku .mgmt-header');
    if (headerSku) {
        const btn = document.createElement('button');
        btn.id = 'btn-spawn-boxes';
        btn.textContent = ' Spawn hàng ngẫu nhiên';
        btn.style.cssText = 'padding:7px 14px;background:#10b981;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:.82em;font-weight:600; margin-right:10px;';
        btn.addEventListener('click', spawnRandomBoxes);
        
        // Chèn vào cạnh nút "Thêm SKU mới"
        const btnAddSku = document.getElementById('btn-add-sku');
        if (btnAddSku) {
            btnAddSku.parentNode.insertBefore(btn, btnAddSku);
        } else {
            headerSku.appendChild(btn);
        }
    }
});
