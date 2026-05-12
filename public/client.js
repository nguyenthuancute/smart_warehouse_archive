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
