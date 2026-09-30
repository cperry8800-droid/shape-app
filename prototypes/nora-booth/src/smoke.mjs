import * as THREE from 'three';
const c=document.createElement('canvas');c.width=400;c.height=300;document.body.appendChild(c);
const r=new THREE.WebGLRenderer({canvas:c,antialias:true});const s=new THREE.Scene();s.background=new THREE.Color(0x101010);
const cam=new THREE.PerspectiveCamera(40,4/3,0.1,100);cam.position.set(2,2,3);cam.lookAt(0,0,0);
s.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x34d6c5})));
s.add(new THREE.HemisphereLight(0xffffff,0x222222,2));r.render(s,cam);window.__ok=r.capabilities.isWebGL2;
