/* ═══════════════ scene3d.js · Three.js 正交相机 2.5D 交易室（1:1 对齐原图） ═══════════════
   原图元素清单：
   · 后墙：超大 K 线屏（粉色网络覆盖 + 标语），右侧币种立柱 + LOCAL TIME + TOP GAINER
   · 左墙：迷你 K 线屏 + 大 DO 灯牌 ×2 + FOMO + RAPER MAMS 机柜
   · 右墙：DO 灯牌 + 宇航员；地板：火箭 / 卫星天线 / 沙发 / 绿植
   · 地板：3 排 ×4 工位，Bot 圆形角色坐镇，粉红神经网络从顶部节点撒网到每个 Bot
   · OrthographicCamera 正交投影 · CanvasTexture 数据屏 · Raycaster 交互            */

'use strict';

const Scene3D = (() => {
  const CFG = {
    roomX: 38, roomZ: 9, wallH: 4.6,
    camPos: [13, 13, 21], lookAt: [0, 0.9, -0.8],
    viewH: 9.2,
  };

  let renderer, scene, camera, host, raycaster, pointer, clock;
  let bots = [], links = [], desks = [], monitorCanvases = [];
  let wallCanvas, wallTex, miniCanvas, miniTex, timeCanvas, timeTex;
  let particles, coins = [], astronaut, rocketFlame, dishGroup;
  let hoverCb = null, botsById = {}, candles = [];
  let spider = null, pickables = [];

  /* ══════════ 贴图工具 ══════════ */
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function texFrom(c){
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function labelTex(text, color = '#ff5fa8', size = 44, w = 512, h = 96){
    const c = makeCanvas(w, h), x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    x.fillStyle = color; x.font = `bold ${size}px Consolas, monospace`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = color; x.shadowBlur = 18;
    x.fillText(text, w / 2, h / 2);
    return texFrom(c);
  }
  function glowSprite(color, size = 1){
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, color);
    g.addColorStop(0.35, color.replace('rgb', 'rgba').replace(')', ',.55)'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texFrom(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .9 }));
    s.scale.set(size, size, 1);
    return s;
  }
  function coinTex(letter, color){
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    x.clearRect(0, 0, 128, 128);
    x.beginPath(); x.arc(64, 64, 52, 0, 7);
    x.fillStyle = '#0d0817'; x.fill();
    x.lineWidth = 9; x.strokeStyle = color;
    x.shadowColor = color; x.shadowBlur = 16; x.stroke();
    x.fillStyle = color; x.font = 'bold 44px Consolas,monospace';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(letter, 64, 68);
    return texFrom(c);
  }
  function doLogoTex(){
    const c = makeCanvas(256, 256), x = c.getContext('2d');
    x.clearRect(0, 0, 256, 256);
    x.strokeStyle = '#c95fd0'; x.lineWidth = 10;
    x.shadowColor = '#ff2d78'; x.shadowBlur = 26;
    x.beginPath();                                    // 六边形
    for(let i = 0; i < 6; i++){
      const a = Math.PI / 3 * i + Math.PI / 6;
      const px = 128 + Math.cos(a) * 92, py = 128 + Math.sin(a) * 92;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath(); x.stroke();
    x.fillStyle = '#e879f9'; x.font = 'bold 84px Consolas,monospace';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('DO', 128, 132);
    return texFrom(c);
  }
  function topGainerTex(){
    const c = makeCanvas(256, 300), x = c.getContext('2d');
    x.fillStyle = 'rgba(8,4,16,.92)'; x.fillRect(0, 0, 256, 300);
    x.strokeStyle = 'rgba(0,255,157,.7)'; x.lineWidth = 3; x.strokeRect(3, 3, 250, 294);
    x.fillStyle = '#00ff9d'; x.font = 'bold 24px Consolas,monospace';
    x.fillText('TOP GAINER', 16, 36);
    const rows = [['#ffd166', 'WIF', '+38.2%'], ['#00ff9d', 'BONK', '+24.7%'],
                  ['#ff5fa8', 'PEPE', '+19.1%'], ['#25d3f0', 'DOGE', '+12.4%'],
                  ['#a06bff', 'FET', '+9.8%'], ['#ff9f43', 'RNDR', '+7.3%']];
    rows.forEach((r, i) => {
      x.fillStyle = r[0]; x.fillRect(16, 56 + i * 38, 20, 20);
      x.fillStyle = 'rgba(232,217,239,.9)'; x.font = '18px Consolas,monospace';
      x.fillText(r[1], 46, 73 + i * 38);
      x.fillStyle = '#00ff9d'; x.fillText(r[2], 150, 73 + i * 38);
    });
    return texFrom(c);
  }

  /* ══════════ 场景搭建 ══════════ */
  function buildRoom(){
    const hx = CFG.roomX / 2, hz = CFG.roomZ / 2;
    // 地板
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roomX, CFG.roomZ),
      new THREE.MeshStandardMaterial({ color: 0x0d0918, roughness: .9, metalness: .15 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);

    const pts = [];
    for(let i = -hx; i <= hx; i += 2) pts.push(i, .01, -hz, i, .01, hz);
    for(let j = -hz; j <= hz; j += 2) pts.push(-hx, .01, j, hx, .01, j);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xff2d78, transparent: true, opacity: .14 })));

    const edge = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hx, .02, -hz), new THREE.Vector3(hx, .02, -hz),
      new THREE.Vector3(hx, .02, hz), new THREE.Vector3(-hx, .02, hz), new THREE.Vector3(-hx, .02, -hz)]);
    scene.add(new THREE.Line(edge, new THREE.LineBasicMaterial({ color: 0xff2d78, transparent: true, opacity: .8 })));

    // 三面墙
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x130d22, roughness: .95, side: THREE.DoubleSide });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roomX, CFG.wallH), wallMat);
    back.position.set(0, CFG.wallH / 2, -hz); scene.add(back);
    const mkSide = x => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(CFG.roomZ, CFG.wallH), wallMat);
      w.rotation.y = Math.PI / 2; w.position.set(x, CFG.wallH / 2, 0); scene.add(w);
    };
    mkSide(-hx); mkSide(hx);

    const seam = [];
    for(let x = -hx + 2; x < hx; x += 2) seam.push(x, .02, -hz + .01, x, CFG.wallH, -hz + .01);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(seam, 3));
    scene.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xff2d78, transparent: true, opacity: .15 })));

    const base = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hx, .06, -hz + .02), new THREE.Vector3(hx, .06, -hz + .02)]);
    scene.add(new THREE.Line(base, new THREE.LineBasicMaterial({ color: 0xff2d78, opacity: .85, transparent: true })));

    /* ---- 后墙大屏：标题 + 蜡烛 + 粉色网络 + 标语（一张 CanvasTexture） ---- */
    wallCanvas = makeCanvas(1536, 400); wallTex = texFrom(wallCanvas);
    const bigPanel = new THREE.Mesh(new THREE.PlaneGeometry(15.2, 3.6), new THREE.MeshBasicMaterial({ map: wallTex }));
    bigPanel.position.set(-2.6, 2.35, -hz + .04); scene.add(bigPanel);
    const bigFrame = new THREE.Mesh(new THREE.PlaneGeometry(15.7, 3.95),
      new THREE.MeshBasicMaterial({ color: 0xff2d78, transparent: true, opacity: .4 }));
    bigFrame.position.set(-2.6, 2.35, -hz + .02); scene.add(bigFrame);

    /* ---- 后墙右侧：币种立柱 + LOCAL TIME + TOP GAINER ---- */
    const COINS = [['◉', '#ff9f43'], ['🟥', '#ff4d4d'], ['🟦', '#25d3f0'], ['🟡', '#ffd166'], ['🐕', '#e8b06b'], ['◈', '#00ff9d']];
    COINS.forEach((cn, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.78, .78),
        new THREE.MeshBasicMaterial({ map: coinTex(cn[0], cn[1]), transparent: true }));
      m.position.set(6.4, 3.85 - i * .8, -hz + .05);
      m.userData.baseY = m.position.y; m.userData.ph = i * 1.3;
      scene.add(m); coins.push(m);
    });
    timeCanvas = makeCanvas(256, 96); timeTex = texFrom(timeCanvas);
    const timeP = new THREE.Mesh(new THREE.PlaneGeometry(2.3, .86), new THREE.MeshBasicMaterial({ map: timeTex, transparent: true }));
    timeP.position.set(6.4, .95, -hz + .05); scene.add(timeP);

    const tg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.0), new THREE.MeshBasicMaterial({ map: topGainerTex(), transparent: true }));
    tg.position.set(10.0, 2.3, -hz + .05); scene.add(tg);

    /* ---- 左墙：迷你 K 线 + DO 灯牌 ×2 + FOMO ---- */
    miniCanvas = makeCanvas(384, 224); miniTex = texFrom(miniCanvas);
    const mini = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.58), new THREE.MeshBasicMaterial({ map: miniTex }));
    mini.rotation.y = Math.PI / 2; mini.position.set(-hx + .05, 2.75, 2.2); scene.add(mini);

    const doTex = doLogoTex();
    const do1 = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: doTex, transparent: true }));
    do1.rotation.y = Math.PI / 2; do1.position.set(-hx + .05, 2.95, -.7); scene.add(do1);
    const do2 = do1.clone(); do2.scale.setScalar(.66); do2.position.set(-hx + .05, 2.5, -2.8); scene.add(do2);
    const fomo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .34),
      new THREE.MeshBasicMaterial({ map: labelTex('FOMO', '#e879f9', 56), transparent: true }));
    fomo.rotation.y = Math.PI / 2; fomo.position.set(-hx + .05, 1.78, -.7); scene.add(fomo);

    /* ---- 左墙机柜：RAPER MAMS ---- */
    const rack = new THREE.Mesh(new THREE.BoxGeometry(.95, 2.3, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x1c1230, roughness: .7, metalness: .4 }));
    rack.position.set(-hx + .55, 1.15, 3.2); scene.add(rack);
    for(let k = 0; k < 10; k++){
      const led = new THREE.Mesh(new THREE.PlaneGeometry(.3, .07),
        new THREE.MeshBasicMaterial({ color: k % 3 ? 0x00ff9d : 0xff2d78 }));
      led.rotation.y = Math.PI / 2;
      led.position.set(-hx + 1.04, .5 + k * .18, 2.7 + (k % 2) * .5); scene.add(led);
    }
    const rackLbl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .3),
      new THREE.MeshBasicMaterial({ map: labelTex('RAPER MAMS', '#8d7a9e', 40), transparent: true }));
    rackLbl.rotation.y = Math.PI / 2; rackLbl.position.set(-hx + 1.06, .18, 3.2); scene.add(rackLbl);

    /* ---- 右墙：DO 灯牌 ---- */
    const do3 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: doTex, transparent: true }));
    do3.rotation.y = -Math.PI / 2; do3.position.set(hx - .05, 2.9, -1.5); scene.add(do3);

    /* ---- 宇航员（右侧漂浮） ---- */
    astronaut = new THREE.Group();
    const bodyM = new THREE.MeshStandardMaterial({ color: 0xf2f2f7, roughness: .35, metalness: .1 });
    const ab = new THREE.Mesh(new THREE.SphereGeometry(.34, 20, 16), bodyM); ab.scale.y = 1.15; astronaut.add(ab);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.23, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x0b0714, roughness: .1, metalness: .8 }));
    helmet.position.set(0, .18, .16); helmet.scale.z = .7; astronaut.add(helmet);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(.3, .4, .16), bodyM);
    pack.position.set(0, -.05, -.32); astronaut.add(pack);
    astronaut.position.set(15.6, 2.3, -2.4); scene.add(astronaut);

    /* ---- 火箭 / 天线 / 沙发 / 绿植 ---- */
    const rocket = new THREE.Group();
    const rb = new THREE.Mesh(new THREE.CylinderGeometry(.17, .21, 1.35, 14),
      new THREE.MeshStandardMaterial({ color: 0xe8e2f2, roughness: .4, metalness: .5 }));
    rb.position.y = .95; rocket.add(rb);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.17, .42, 14),
      new THREE.MeshStandardMaterial({ color: 0xff2d78, emissive: 0xff2d78, emissiveIntensity: .6 }));
    nose.position.y = 1.83; rocket.add(nose);
    rocketFlame = glowSprite('rgb(255,209,102)', 1.2); rocketFlame.position.y = .1; rocket.add(rocketFlame);
    rocket.position.set(14.2, 0, -2.6); scene.add(rocket);

    dishGroup = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, .75, 8),
      new THREE.MeshStandardMaterial({ color: 0x8d7a9e }));
    mast.position.y = .37; dishGroup.add(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(.46, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.6),
      new THREE.MeshStandardMaterial({ color: 0xcfd8e8, side: THREE.DoubleSide, roughness: .4, metalness: .6 }));
    dish.rotation.x = -Math.PI / 2.4; dish.position.y = .9; dishGroup.add(dish);
    dishGroup.position.set(11.8, 0, 2.6); scene.add(dishGroup);

    const sofa = new THREE.Group();
    const sMat = new THREE.MeshStandardMaterial({ color: 0x34204e, roughness: .9 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.6, .38, .9), sMat); seat.position.y = .3; sofa.add(seat);
    const backr = new THREE.Mesh(new THREE.BoxGeometry(2.6, .6, .22), sMat); backr.position.set(0, .64, -.34); sofa.add(backr);
    sofa.position.set(-2.2, 0, 3.7); scene.add(sofa);

    [[-16.5, 2.4], [-15.8, -3.2], [6.5, -3.4], [16.6, 2.8], [-5.8, 3.8], [8.6, 3.7]].forEach(([x, z]) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(.2, .15, .3, 10),
        new THREE.MeshStandardMaterial({ color: 0x3a1f4d, roughness: .9 }));
      pot.position.set(x, .15, z); scene.add(pot);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(.38, 0),
        new THREE.MeshStandardMaterial({ color: 0x1f7a4b, emissive: 0x0d3020, roughness: .8 }));
      leaf.position.set(x, .72, z); leaf.scale.y = 1.6; scene.add(leaf);
    });
  }

  /* ══════════ 工位（3 排 × 4） ══════════ */
  const ROW_Z = [-1.9, .9, 3.6];
  const COL_X = [-14, -7.5, -1, 5.5];
  function buildDesks(){
    ROW_Z.forEach((z, r) => COL_X.forEach((x, c) => {
      const g = new THREE.Group();
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1b45, roughness: .7, metalness: .25 });
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, .09, 1.1), woodMat);
      top.position.y = .84; g.add(top);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: .8 });
      [[-.95, -.45], [.95, -.45], [-.95, .45], [.95, .45]].forEach(([dx, dz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(.08, .82, .08), legMat);
        leg.position.set(dx, .42, dz); g.add(leg);
      });
      // 显示器：霓虹绿图表贴图
      const cv = makeCanvas(256, 128); monitorCanvases.push(cv);
      const mon = new THREE.Mesh(new THREE.PlaneGeometry(.95, .48), new THREE.MeshBasicMaterial({ map: texFrom(cv) }));
      mon.position.set(0, 1.24, -.1); mon.rotation.x = -.1; g.add(mon);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.04, .56, .05),
        new THREE.MeshStandardMaterial({ color: 0x0d0718, roughness: .6 }));
      frame.position.set(0, 1.24, -.14); frame.rotation.x = -.1; g.add(frame);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(.07, .3, .07), legMat);
      stand.position.set(0, 1.0, -.18); g.add(stand);
      g.position.set(x, 0, z);
      g.userData = { r, c, seed: r * 4 + c };
      scene.add(g); desks.push(g);
    }));
  }

  /* ══════════ Bot 角色 ══════════ */
  const BOT_DESK = { chief: [0, 1], scan: [1, 0], vet: [1, 1], social: [1, 2],
                     risk: [1, 3], size: [2, 1], fills: [2, 2], crawler: [0, 3] };
  function buildBot(ag){
    const [r, c] = BOT_DESK[ag.id];
    const x = COL_X[c] + .35, z = ROW_Z[r] - .95;      // 坐在工位后侧
    const col = new THREE.Color(ag.color);
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(.27, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0x120a1e, emissive: col, emissiveIntensity: 1.25, roughness: .3 }));
    body.position.y = 1.38; grp.add(body);
    const halo = glowSprite(`rgb(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0})`, 1.5);
    halo.position.y = 1.38; grp.add(halo);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0b0512 });
    [-.08, .08].forEach(dx => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 8), eyeMat);
      e.position.set(dx, 1.45, .23); grp.add(e);
    });
    const hit = new THREE.Mesh(new THREE.SphereGeometry(.5, 8, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 1.38; grp.add(hit);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .24),
      new THREE.MeshBasicMaterial({ map: labelTex(ag.name, ag.color, 52), transparent: true }));
    name.position.set(0, 1.95, 0); grp.add(name);
    grp.position.set(x, 0, z); scene.add(grp);
    const rec = { id: ag.id, cfg: ag, group: grp, body, halo, ring: null, name, base: { x, z }, phase: 'IDLE' };
    hit.userData.bot = rec; bots.push(rec); botsById[ag.id] = rec;
  }

  /* ══════════ 粉红神经网络：顶部节点 → 每个 Bot ══════════ */
  function buildWeb(){
    const hub = new THREE.Vector3(-2.6, 4.15, -CFG.roomZ / 2 + .3);
    const hubSprite = glowSprite('rgb(255,45,120)', 2.6); hubSprite.position.copy(hub); scene.add(hubSprite);
    const hub2 = glowSprite('rgb(255,95,168)', 1.1); hub2.position.set(hub.x + .5, hub.y + .3, hub.z); scene.add(hub2);
    const anchors = [new THREE.Vector3(-8.5, 3.9, -CFG.roomZ / 2 + .25), new THREE.Vector3(2, 4.1, -CFG.roomZ / 2 + .25),
                     new THREE.Vector3(-13.5, 3.7, -CFG.roomZ / 2 + .25), new THREE.Vector3(6.5, 3.6, -CFG.roomZ / 2 + .25)];
    // 节点间网状
    const webPts = [hub, ...anchors];
    const lm = new THREE.LineBasicMaterial({ color: 0xff2d78, transparent: true, opacity: .8 });
    for(let i = 0; i < webPts.length; i++)
      for(let j = i + 1; j < webPts.length; j++){
        if(j > i + 2) continue;
        const g = new THREE.BufferGeometry().setFromPoints([webPts[i], webPts[j]]);
        scene.add(new THREE.Line(g, lm));
      }
    anchors.forEach(a => scene.add(glowSprite('rgb(255,45,120)', .7).translateX(a.x).translateY(a.y).translateZ(a.z)));
    // → 每个 Bot 的曲线 + 流动光点
    bots.forEach((b, i) => {
      const from = hub.clone();
      const to = new THREE.Vector3(b.base.x, 1.45, b.base.z);
      const mid = new THREE.Vector3((from.x + to.x) / 2, Math.max(from.y, to.y) + .55, (from.z + to.z) / 2);
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff2d78, transparent: true, opacity: .5 }));
      scene.add(line);
      const sprites = [0, .5].map(off => {
        const s = glowSprite('rgb(255,95,168)', .4); scene.add(s); return { s, off };
      });
      links.push({ curve, line, sprites, idx: i });
    });
  }

  /* ══════════ 粒子 ══════════ */
  function buildParticles(){
    const N = 300, pos = new Float32Array(N * 3);
    for(let i = 0; i < N; i++){
      pos[i * 3] = (Math.random() - .5) * CFG.roomX;
      pos[i * 3 + 1] = Math.random() * 4;
      pos[i * 3 + 2] = (Math.random() - .5) * CFG.roomZ;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xff5fa8, size: .05, transparent: true, opacity: .6,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(particles);
  }

  /* ══════════ 赛博蜘蛛交易员：中央游走 + 8 腿步态 ══════════ */
  function buildSpider(){
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x140a20, emissive: 0xff2d78,
      emissiveIntensity: .85, roughness: .45 });
    const abd = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), mat);
    abd.position.set(0, .3, -.18); abd.scale.set(1, .85, 1.25); g.add(abd);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), mat);
    head.position.set(0, .3, .12); g.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ff9d });
    [[-.05, .34, .24], [.05, .34, .24], [-.028, .275, .25], [.028, .275, .25]].forEach(p => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 8), eyeMat);
      e.position.set(p[0], p[1], p[2]); g.add(e);
    });
    // 8 条腿：hip → knee → foot 两段圆柱，交替步态
    const legs = [];
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1030, emissive: 0xff2d78,
      emissiveIntensity: .35, roughness: .6 });
    for(let side = -1; side <= 1; side += 2){
      for(let i = 0; i < 4; i++){
        const hip = new THREE.Vector3(side * .12, .3, .18 - i * .13);
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(.018, .014, .34, 6), legMat);
        const lower = new THREE.Mesh(new THREE.CylinderGeometry(.012, .008, .4, 6), legMat);
        g.add(upper); g.add(lower);
        legs.push({ side, i, hip, upper, lower,
                    phase: (i % 2) * Math.PI + (side > 0 ? 0 : Math.PI / 2) });
      }
    }
    const glow = glowSprite('rgb(255,45,120)', 1.5); glow.position.y = .25; g.add(glow);
    // 悬停命中 → 显示 CRAWLER 卡片
    const hit = new THREE.Mesh(new THREE.SphereGeometry(.55, 8, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = .3; hit.userData.bot = botsById['crawler']; g.add(hit);
    g.position.set(-2, 0, 1.2);
    g.scale.setScalar(1.4);                       // 让蜘蛛在全景下足够醒目
    scene.add(g);
    spider = { g, legs, glow, t0: 40 };
  }

  function placeLimb(mesh, a, b, len){
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    const d = new THREE.Vector3().subVectors(b, a);
    const dl = d.length() || .001;
    mesh.scale.set(1, dl / len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  function animSpider(t){
    if(!spider) return;
    const s = spider, w = .22, tt = t + s.t0;
    // 中央走廊利萨如轨迹（z 限制在两排工位之间的走道，避免穿模）
    const x = -2 + 4.4 * Math.cos(tt * w);
    const z = 2.05 + .75 * Math.sin(tt * w * 1.4);
    const nx = -2 + 4.4 * Math.cos((tt + .12) * w);
    const nz = 2.05 + .75 * Math.sin((tt + .12) * w * 1.4);
    s.g.position.set(x, 0, z);
    if(Math.abs(nx - x) + Math.abs(nz - z) > 1e-4)
      s.g.rotation.y = Math.atan2(nx - x, nz - z);
    const speed = 8.5;
    s.legs.forEach(L => {
      const sw = Math.sin(tt * speed + L.phase);
      const lift = Math.max(0, Math.sin(tt * speed + L.phase));
      const knee = new THREE.Vector3(L.side * .32, .55 + lift * .07, L.hip.z + (L.i - 1.5) * .05 + sw * .06);
      const foot = new THREE.Vector3(L.side * (.36 + .08 * lift), .03 + lift * .14,
                                     L.hip.z + sw * .14 + (L.i - 1.5) * .06);
      placeLimb(L.upper, L.hip, knee, .34);
      placeLimb(L.lower, knee, foot, .4);
    });
    // CRAWLER 打字时蜘蛛高亮
    const active = botsById['crawler'] && botsById['crawler'].phase !== 'IDLE';
    s.glow.material.opacity = active ? .95 : .5;
    s.glow.scale.setScalar(active ? 1.9 + Math.sin(t * 5) * .3 : 1.4);
  }

  /* ══════════ 初始化 ══════════ */
  function init(hostEl, agents, onHover){
    host = hostEl; hoverCb = onHover;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x0a0614, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0614, .016);

    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 200);
    camera.position.set(...CFG.camPos);
    camera.lookAt(new THREE.Vector3(...CFG.lookAt));

    scene.add(new THREE.AmbientLight(0x8a6ba8, 1.6));
    const hemi = new THREE.HemisphereLight(0xff9ec8, 0x1a1030, .9); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe2ee, 1.6); key.position.set(6, 14, 10); scene.add(key);
    [[-8, 4, 0, 0xff2d78, 110], [4, 3.6, -2, 0xff5fa8, 80], [12, 3.4, -2, 0x25d3f0, 70],
     [0, 3.2, 3, 0x00ff9d, 55], [-16, 3.4, 1, 0xa06bff, 60]].forEach(([x, y, z, c, i]) => {
      const p = new THREE.PointLight(c, i, 30); p.position.set(x, y, z); scene.add(p);
    });

    buildRoom();
    buildDesks();
    agents.forEach(buildBot);
    buildWeb();
    buildSpider();
    buildParticles();
    pickables = bots.map(b => b.group);
    pickables.push(spider.g);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2(-9, -9);
    clock = new THREE.Clock();

    renderer.domElement.addEventListener('pointermove', e => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, true);
      let found = null;
      for(const h of hits){
        let o = h.object; while(o && !o.userData.bot) o = o.parent;
        if(o){ found = o.userData.bot; break; }
      }
      renderer.domElement.style.cursor = found ? 'pointer' : 'crosshair';
      if(hoverCb) hoverCb(found ? { id: found.id, x: e.clientX - r.left + 16, y: Math.max(6, e.clientY - r.top - 78) } : null);
    });
    renderer.domElement.addEventListener('pointerleave', () => { if(hoverCb) hoverCb(null); });

    resize();
    addEventListener('resize', resize);
    animate();
  }

  function resize(){
    if(!renderer || !host) return;
    const r = host.getBoundingClientRect();
    if(!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    const aspect = r.width / r.height, h = CFG.viewH, w = h * aspect;
    camera.left = -w / 2; camera.right = w / 2;
    camera.top = h / 2; camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }

  /* ══════════ 大屏绘制：标题 + 蜡烛 + 粉色网络 + 标语 ══════════ */
  function paintWall(){
    const c = wallCanvas.getContext('2d'), W = 1536, H = 400;
    c.fillStyle = '#07030e'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,45,120,.95)'; c.font = 'bold 22px Consolas,monospace';
    c.fillText('AML + SCALP FLOW + KALE MEMBRANE + LIVE GRID', 22, 32);
    c.strokeStyle = 'rgba(255,45,120,.14)';
    for(let i = 1; i < 5; i++){ c.beginPath(); c.moveTo(0, 48 + (H - 96) * i / 5); c.lineTo(W, 48 + (H - 96) * i / 5); c.stroke(); }
    if(candles.length < 4){ wallTex.needsUpdate = true; return; }
    const cs = candles.slice(-64);
    const lo = Math.min(...cs.map(k => k.l)), hi = Math.max(...cs.map(k => k.h));
    const Y = v => H - 42 - (v - lo) / (hi - lo || 1) * (H - 128);
    const bw = (W - 40) / cs.length;
    cs.forEach((k, i) => {
      const x = 20 + i * bw + bw / 2, up = k.c >= k.o;
      c.strokeStyle = c.fillStyle = up ? '#00ff9d' : '#ff2d78';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, Y(k.h)); c.lineTo(x, Y(k.l)); c.stroke();
      c.fillRect(x - bw * .3, Math.min(Y(k.o), Y(k.c)), bw * .6, Math.max(2, Math.abs(Y(k.c) - Y(k.o))));
    });
    // 粉色网络覆盖（原图标志性的网状结构）
    const webN = 14, nodes = [];
    let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for(let i = 0; i < webN; i++) nodes.push({ x: 60 + rnd() * (W - 120), y: 46 + rnd() * 130 });
    c.strokeStyle = 'rgba(255,45,120,.75)'; c.lineWidth = 1.6;
    c.shadowColor = '#ff2d78'; c.shadowBlur = 8;
    for(let i = 0; i < nodes.length; i++)
      for(let j = i + 1; j < nodes.length; j++){
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        if(dx * dx + dy * dy < 110000){
          c.beginPath(); c.moveTo(nodes[i].x, nodes[i].y); c.lineTo(nodes[j].x, nodes[j].y); c.stroke();
        }
      }
    nodes.forEach(n => { c.fillStyle = '#ff5fa8'; c.beginPath(); c.arc(n.x, n.y, 4.5, 0, 7); c.fill(); });
    c.shadowBlur = 0;
    // 底部标语
    c.fillStyle = 'rgba(255,95,168,.85)'; c.font = 'bold 19px Consolas,monospace';
    c.fillText('WE ARE ALL CAUGHT IN THE FLOW OF THE TWIN — WELCOME CHAOS', 22, H - 14);
    // 最新价
    const last = cs[cs.length - 1].c;
    c.fillStyle = '#00ff9d'; c.font = 'bold 24px Consolas,monospace';
    c.fillText(last.toFixed(2), W - 108, Y(last) - 10);
    wallTex.needsUpdate = true;
  }

  function paintMini(){
    const c = miniCanvas.getContext('2d'), W = 384, H = 224;
    c.fillStyle = '#07030e'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,255,157,.9)'; c.font = 'bold 16px Consolas,monospace';
    c.fillText('SCALP 1m', 10, 22);
    if(candles.length < 4){ miniTex.needsUpdate = true; return; }
    const cs = candles.slice(-36);
    const lo = Math.min(...cs.map(k => k.l)), hi = Math.max(...cs.map(k => k.h));
    const Y = v => H - 16 - (v - lo) / (hi - lo || 1) * (H - 50);
    const bw = (W - 16) / cs.length;
    cs.forEach((k, i) => {
      const x = 8 + i * bw + bw / 2, up = k.c >= k.o;
      c.strokeStyle = c.fillStyle = up ? '#00ff9d' : '#ff2d78';
      c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x, Y(k.h)); c.lineTo(x, Y(k.l)); c.stroke();
      c.fillRect(x - bw * .28, Math.min(Y(k.o), Y(k.c)), bw * .56, Math.max(1.5, Math.abs(Y(k.c) - Y(k.o))));
    });
    miniTex.needsUpdate = true;
  }

  function paintTime(){
    const c = timeCanvas.getContext('2d'), W = 256, H = 96;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(8,4,16,.92)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,45,120,.8)'; c.lineWidth = 3; c.strokeRect(2, 2, W - 4, H - 4);
    const n = new Date();
    c.fillStyle = '#fff'; c.font = 'bold 30px Consolas,monospace'; c.textAlign = 'center';
    c.fillText(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, W / 2, 44);
    c.fillStyle = '#8d7a9e'; c.font = '15px Consolas,monospace';
    c.fillText('LOCAL TIME', W / 2, 74);
    timeTex.needsUpdate = true;
  }

  function paintMonitor(i, seed){
    const cv = monitorCanvases[i]; if(!cv) return;
    const c = cv.getContext('2d'), W = 256, H = 128;
    c.fillStyle = '#050c09'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(0,255,157,.85)'; c.lineWidth = 2;
    c.beginPath();
    for(let k = 0; k <= 30; k++){
      const v = .5 + Math.sin(seed * 3 + k * .55) * .18 + Math.sin(seed + k * 1.9) * .1;
      k ? c.lineTo(k / 30 * W, H - 34 - v * 70) : c.moveTo(0, H - 34 - v * 70);
    }
    c.stroke();
    for(let k = 0; k < 16; k++){
      const hh = 6 + Math.abs(Math.sin(seed + k * 1.2 + performance.now() / 1500)) * 24;
      c.fillStyle = k % 2 ? 'rgba(255,45,120,.8)' : 'rgba(0,255,157,.8)';
      c.fillRect(8 + k * 15, H - 8 - hh, 8, hh);
    }
    c.fillStyle = 'rgba(0,255,157,.75)'; c.font = '12px Consolas,monospace';
    c.fillText('JEV · ' + String(i + 1).padStart(2, '0'), 8, 18);
  }

  /* ══════════ 状态注入 ══════════ */
  function update(state){
    candles = state.candles || candles;
    if(state.agents){
      Object.entries(state.agents).forEach(([id, s]) => {
        const b = botsById[id]; if(!b) return;
        b.phase = s.phase; b.text = s.text;
      });
    }
    paintWall();
    paintMini();
    paintTime();
    desks.forEach((d, i) => paintMonitor(i, d.userData.seed + .3));
  }

  /* ══════════ 渲染循环 ══════════ */
  function animate(){
    requestAnimationFrame(animate);
    if(!renderer) return;
    const t = clock.getElapsedTime();

    bots.forEach((b, i) => {
      const active = b.phase !== 'IDLE';
      const bob = Math.sin(t * 1.8 + i * 1.3) * .05;
      b.body.position.y = 1.38 + bob;
      b.halo.position.y = 1.38 + bob;
      b.body.material.emissiveIntensity = active ? 1.9 + Math.sin(t * 6 + i) * .55 : 1.05;
      const hs = active ? 1.8 + Math.sin(t * 4 + i) * .28 : 1.35;
      b.halo.scale.set(hs, hs, 1);
      b.halo.material.opacity = active ? .9 : .5;
      b.name.position.y = 1.95 + bob * .5;
    });

    links.forEach((l, i) => {
      const active = bots[i] && bots[i].phase !== 'IDLE';
      l.line.material.opacity = active ? .8 : .42;
      l.sprites.forEach(sp => {
        const k = ((t * .4) + sp.off + i * .13) % 1;
        sp.s.position.copy(l.curve.getPoint(k));
        sp.s.material.opacity = active ? 1 : .55;
      });
    });

    coins.forEach(cn => { cn.position.y = cn.userData.baseY + Math.sin(t * 1.4 + cn.userData.ph) * .07; });
    animSpider(t);
    if(astronaut) astronaut.position.y = 2.4 + Math.sin(t * .9) * .16;
    if(rocketFlame) rocketFlame.material.opacity = .7 + Math.sin(t * 11) * .3;
    if(dishGroup) dishGroup.rotation.y = Math.sin(t * .4) * .5;

    if(particles){
      const arr = particles.geometry.attributes.position.array;
      for(let i = 1; i < arr.length; i += 3){
        arr[i] += .0024;
        if(arr[i] > 4.1) arr[i] = .04;
      }
      particles.geometry.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  return { init, update, resize };
})();
