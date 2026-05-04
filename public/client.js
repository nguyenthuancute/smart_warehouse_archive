
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const socket = io();

// --- SETUP THREE.JS (3D) ---
const container = document.getElementById('scene-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(15, 20, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
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
const axisCamera = new THREE.PerspectiveCamera(50, axisContainer.clientWidth / axisContainer.clientHeight, 0.1, 10);
axisCamera.position.z = 2;
const axisRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
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

// Left-click to select
container.addEventListener('click', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
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

// --- ANIMATION LOOP & RESIZE ---
function animate() {
    requestAnimationFrame(animate);
    updateCameraMovement();
    updateObjectMovement();
    interpolateTagPositions();
    controls.update();
    renderer.render(scene, camera);
    axisCamera.quaternion.copy(camera.quaternion);
    axisRenderer.render(axisScene, axisCamera);
}
animate();

const viewport = document.getElementById('viewport');
window.addEventListener('resize', () => {
    const { clientWidth, clientHeight } = viewport;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);

    axisCamera.aspect = axisContainer.clientWidth / axisContainer.clientHeight;
    axisCamera.updateProjectionMatrix();
    axisRenderer.setSize(axisContainer.clientWidth, axisContainer.clientHeight);
});

// Initial setup
createRoom3D(roomConfig.length, roomConfig.width, roomConfig.height);
renderAnchorList();
renderObjectList();
window.dispatchEvent(new Event('resize'));


// --- UI LOGIC (MOVED FROM INDEX.HTML) ---

// Switch between 3D and 2D modes
const btn3d = document.getElementById('btn-mode-3d');
const btn2d = document.getElementById('btn-mode-2d');
const sceneContainer = document.getElementById('scene-container');
const mapContainer = document.getElementById('map-2d-container');

btn3d.addEventListener('click', () => {
    sceneContainer.style.display = 'block';
    mapContainer.style.display = 'none';
    axisContainer.style.display = 'block';
    btn3d.classList.add('active');
    btn2d.classList.remove('active');
});

btn2d.addEventListener('click', () => {
    sceneContainer.style.display = 'none';
    mapContainer.style.display = 'flex';
    axisContainer.style.display = 'none';
    btn2d.classList.add('active');
    btn3d.classList.remove('active');
    window.dispatchEvent(new Event('resize'));
});

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

// Floating Panel Logic
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

panelHeader.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialX = floatingPanel.offsetLeft;
    initialY = floatingPanel.offsetTop;
    panelHeader.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    floatingPanel.style.left = (initialX + dx) + 'px';
    floatingPanel.style.top = (initialY + dy) + 'px';
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    panelHeader.style.cursor = 'grab';
});
// --- LOGIC KHO CÓ SẴN (KHO MÊ KÔNG) - THÊM CỬA 2 CÁNH VÀ 2 CỬA CUỐN ---
const btnLoadMekong = document.getElementById('btn-load-mekong');

if (btnLoadMekong) {
    btnLoadMekong.addEventListener('click', () => {
        // Cập nhật không gian kho 15x30x5
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

        // Hàm 1: Tạo khối đặc (dùng cho băng chuyền)
        function createSolidBox(color, x, z, sizeX, sizeZ, sizeY) {
            const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
            const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
            const mesh = new THREE.Mesh(geo, mat);
            const edges = new THREE.EdgesGeometry(geo);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
            const wireframe = new THREE.LineSegments(edges, lineMat);
            mesh.add(wireframe);
            mesh.position.set(x, sizeY / 2, z); 
            presetGroup.add(mesh);
        }

        // Hàm 2: Tạo cụm kệ hàng 
        function createDetailedRack(x, z, sizeX, bayLength, bays, sizeY, tiers = 3, hasBoxes = false) {
            const rackGroup = new THREE.Group();
            
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 }); 
            const shelfMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.5 }); 
            const boxMat = new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.9 }); 

            const frameThick = 0.08; 
            const shelfThick = 0.05; 
            
            const bottomTierY = sizeY * 0.15; 
            const topTierY = sizeY * 0.85; 
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
                    const wireframe = new THREE.LineSegments(shelfEdges, shelfLineMat);
                    shelf.add(wireframe);

                    const tierY = bottomTierY + i * tierSpacing;
                    shelf.position.set(0, tierY, shelfZ);
                    rackGroup.add(shelf);

                    if (hasBoxes) {
                        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
                        const boxWireframe = new THREE.LineSegments(boxEdges, boxLineMat);
                        boxMesh.add(boxWireframe);
                        
                        const boxY = tierY + (shelfThick / 2) + (boxHeight / 2);
                        boxMesh.position.set(0, boxY, shelfZ);
                        rackGroup.add(boxMesh);
                    }
                }
            }

            rackGroup.position.set(x, 0, z);
            presetGroup.add(rackGroup);
        }

        const rackWidth = 1.0; 
        const lowHeight = 2.8; 
        const highHeight = 3.0; 

        // 1. VẼ DÃY HÀNG THẤP (XANH)
        for(let i = 0; i < 3; i++) {
            const currentZ = 3.4 + i * 4.3; 
            
            createDetailedRack(2.4, currentZ, rackWidth, 1.0, 4, lowHeight, 3, false); 
            createDetailedRack(6.4, currentZ, rackWidth, 1.0, 4, lowHeight, 3, false); 
        }

        // 2. VẼ BĂNG CHUYỀN (XÁM)
        createSolidBox(0x9ca3af, 4.4, 7.7, 0.8, 12.6, 0.5);

        // 3. VẼ DÃY HÀNG CAO (ĐỎ)
        createDetailedRack(7.5, 7.7, rackWidth, 1.2, 12, highHeight, 3, true);
        createDetailedRack(14.5, 7.7, rackWidth, 1.2, 12, highHeight, 3, true);

        // 4. VẼ HỆ THỐNG CỬA (ÉP SÁT TƯỜNG DƯỚI Z = 30)
        const doorDepth = 0.1;
        const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

        // --- 4.1. CỬA ĐÔI (Cửa 2 cánh góc trái) ---
        const wingWidth = 1.0; 
        const doorHeight = 2.5; 
        const wingGeo = new THREE.BoxGeometry(wingWidth, doorHeight, doorDepth);
        const wingMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 }); // Màu gỗ
        const wingEdges = new THREE.EdgesGeometry(wingGeo);
        
        // Cánh trái
        const leftWing = new THREE.Mesh(wingGeo, wingMat);
        leftWing.add(new THREE.LineSegments(wingEdges, lineMat));
        leftWing.position.set(1.0, doorHeight / 2, 29.95);
        presetGroup.add(leftWing);

        // Cánh phải
        const rightWing = new THREE.Mesh(wingGeo, wingMat);
        rightWing.add(new THREE.LineSegments(wingEdges, lineMat));
        rightWing.position.set(2.0, doorHeight / 2, 29.95);
        presetGroup.add(rightWing);

        // --- 4.2. CỬA CUỐN (2 cửa góc phải) ---
        const rollWidth = 3.5; 
        const rollHeight = 3.5; 
        const rollGeo = new THREE.BoxGeometry(rollWidth, rollHeight, doorDepth);
        const rollMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 }); // Màu xám kim loại
        const rollEdges = new THREE.EdgesGeometry(rollGeo);

        // Cửa cuốn 1 (Ngay lối đi giữa)
        const rollDoor1 = new THREE.Mesh(rollGeo, rollMat);
        rollDoor1.add(new THREE.LineSegments(rollEdges, lineMat));
        rollDoor1.position.set(7.5, rollHeight / 2, 29.95);
        presetGroup.add(rollDoor1);

        // Cửa cuốn 2 (Lối đi bìa phải)
        const rollDoor2 = new THREE.Mesh(rollGeo, rollMat);
        rollDoor2.add(new THREE.LineSegments(rollEdges, lineMat));
        rollDoor2.position.set(12.0, rollHeight / 2, 29.95);
        presetGroup.add(rollDoor2);

        // Thiết lập lại góc nhìn Camera để bao quát tường dưới
        camera.position.set(7.5, 28, 42);
        controls.target.set(7.5, 0, 15);
    });
}
