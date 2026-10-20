/* ============================================================
   SPIDER CORE — 机械蜘蛛渲染引擎
   几何实现移植自 prompt-spider-ui (MIT, github.com/Kirito14IT)
   按 MIT 协议保留出处；主题色适配量化大屏
   ============================================================ */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const finite = (v, f = 0) => Number.isFinite(v) ? v : f;
  const fraction = v => v - Math.floor(v);
  const smooth = v => v * v * (3 - 2 * v);
  const mix = (a, b, f) => a + (b - a) * f;

  function path(ctx, points, color, width = 0.75) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function strideAt(cycle, stride) {
    const phase = fraction(cycle);
    if (phase < 0.64) return { along: (0.5 - phase / 0.64) * stride, lift: 0 };
    const swing = (phase - 0.64) / 0.36;
    return { along: (smooth(swing) - 0.5) * stride, lift: Math.sin(swing * Math.PI) };
  }

  function heartbeatAt(time) {
    const phase = fraction(finite(time) / 0.86);
    const beat = Math.min(1, Math.exp(-(((phase - .16) / .055) ** 2)) + .62 * Math.exp(-(((phase - .38) / .07) ** 2)));
    return { phase, beat, size: 8.5 + 6 * beat, glow: 4 + 10 * beat, intensity: .66 + .34 * beat, roundness: 1.1 + 1.8 * beat, rotation: Math.sin(time * 2.7) * .1 + beat * .12 };
  }

  function legPose({ time = 0, phase = 0, speed = 0, localVelocity = { x: 0, y: 1 }, side = -1, index = 0 } = {}) {
    const stride = 13 + Math.min(speed * .11, 13);
    const frequency = 1.8 + Math.min(speed / 200, .65);
    const row = (index - 3.5) / 3.8, spread = Math.sin((index + .75) / 8.5 * Math.PI);
    const cycle = time * frequency + phase + (index % 2) * .5 + (side > 0 ? .5 : 0) + index * .035;
    const step = strideAt(cycle, stride);
    const curl = Math.sin(cycle * TAU) * 2.8;
    const root = { x: side * (22.2 * Math.sqrt(1 - row * row)), y: row * 27 };
    const foot = { x: side * (39 + spread * 17) + localVelocity.x * step.along - side * step.lift * 7.5 + side * curl, y: row * 52 + localVelocity.y * step.along - step.lift * 10 + curl * .65 };
    const knee = { x: side * (30 + spread * 9) - side * step.lift * 4, y: row * 34 + (index < 4 ? -5.5 : 5.5) - step.lift * 5 + curl * .4 };
    const ankle = { x: foot.x - side * 3.8, y: foot.y + (index < 4 ? 1.2 : -1.2) };
    return { root, knee, ankle, foot, lift: step.lift };
  }

  function drawLegs(ctx, time, gaitPhase, speed, localVelocity) {
    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < 8; index++) {
        const pose = legPose({ time, phase: gaitPhase, speed, localVelocity, side, index });
        const { root, knee, ankle, foot, lift } = pose;
        const spread = Math.sin((index + .75) / 8.5 * Math.PI);
        path(ctx, [root, knee, ankle, foot], 'rgba(89,188,170,0.14)', 2.3);
        path(ctx, [root, knee, ankle, foot], `rgba(171,235,220,${0.6 + spread * 0.19})`, 1.05);
        ctx.fillStyle = lift > 0.35 ? 'rgba(190,241,225,0.72)' : 'rgba(232,255,246,0.96)';
        ctx.fillRect(foot.x - 1.2, foot.y - 1.2, 2.4, 2.4);
        ctx.fillStyle = 'rgba(127,206,188,0.43)';
        ctx.fillRect(knee.x - 0.55, knee.y - 0.55, 1.1, 1.1);
      }
    }
  }

  function drawFeelers(ctx, time, activeCount = 0) {
    const localCount = Math.max(4, 22 - activeCount);
    for (let index = 0; index < localCount; index++) {
      const angle = index / localCount * TAU + 0.065;
      const outward = 43 + 15 * (0.5 + 0.5 * Math.sin(time * 2.7 + index * 4.73));
      const sway = Math.sin(time * 2.8 + index * 2.17) * 5.8;
      const root = { x: Math.cos(angle) * 21, y: Math.sin(angle) * 27 };
      const tip = { x: Math.cos(angle) * outward + sway, y: Math.sin(angle) * outward * 1.06 };
      const bend = { x: root.x * 0.4 + tip.x * 0.6 - Math.sin(angle) * 3, y: root.y * 0.4 + tip.y * 0.6 + Math.cos(angle) * 3 };
      ctx.beginPath();
      ctx.moveTo(root.x, root.y);
      ctx.quadraticCurveTo(bend.x, bend.y, tip.x, tip.y);
      ctx.strokeStyle = 'rgba(117,184,172,0.24)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      for (let dot = 0.55; dot <= 1; dot += 0.15) {
        const one = 1 - dot;
        const px = one * one * root.x + 2 * one * dot * bend.x + dot * dot * tip.x;
        const py = one * one * root.y + 2 * one * dot * bend.y + dot * dot * tip.y;
        const pulse = 0.6 + 0.18 * Math.sin(time * 4 - dot * 9 + index);
        ctx.fillStyle = `rgba(195,233,217,${pulse * 0.55})`;
        ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
      }
    }
  }

  function wirePoint(latitude, longitude, time) {
    const ring = Math.cos(latitude);
    const x = 23.5 * ring * Math.cos(longitude);
    const y = 29.5 * Math.sin(latitude);
    const z = 13 * ring * Math.sin(longitude);
    const tilt = 0.38 + Math.sin(time * 0.32) * 0.07;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const py = y * c - z * s;
    const pz = y * s + z * c;
    return { x: x * 0.94 + pz * 0.3, y: py, z: pz * 0.94 - x * 0.3 };
  }

  function drawWireBody(ctx, time, heartbeat) {
    const fill = ctx.createRadialGradient(-7, -9, 1, 0, 0, 33);
    fill.addColorStop(0, 'rgba(22,70,67,0.89)');
    fill.addColorStop(0.72, 'rgba(10,46,45,0.88)');
    fill.addColorStop(1, 'rgba(7,29,29,0.86)');
    ctx.beginPath(); ctx.ellipse(0, 0, 23.7, 30, 0, 0, TAU);
    ctx.fillStyle = fill; ctx.fill();

    ctx.save();
    ctx.clip();
    const curves = [];
    for (let ring = -5; ring <= 5; ring++) {
      const points = [];
      for (let point = 0; point <= 64; point++) points.push(wirePoint(ring / 6 * Math.PI / 2, point / 64 * TAU, time));
      curves.push(points);
    }
    for (let meridian = 0; meridian < 13; meridian++) {
      const points = [];
      for (let point = 0; point <= 56; point++) points.push(wirePoint(-Math.PI / 2 + point / 56 * Math.PI, meridian / 13 * TAU + time * 0.045, time));
      curves.push(points);
    }
    for (let front = 0; front < 2; front++) {
      ctx.lineWidth = front ? 0.55 : 0.45;
      ctx.strokeStyle = front ? 'rgba(103,204,188,0.43)' : 'rgba(88,165,156,0.18)';
      ctx.beginPath();
      for (const points of curves) {
        for (let index = 1; index < points.length; index++) {
          const previous = points[index - 1], current = points[index];
          if ((previous.z + current.z >= 0) !== Boolean(front)) continue;
          ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath(); ctx.ellipse(0, 0, 23.7, 30, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(110,234,211,0.85)'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0.8, 0.5, 25, 30.9, 0.015, 0, TAU);
    ctx.strokeStyle = 'rgba(80,185,168,0.26)'; ctx.lineWidth = 0.5; ctx.stroke();

    const { beat, size, glow, intensity, roundness, rotation } = heartbeat;
    ctx.save();
    ctx.rotate(rotation); ctx.shadowColor = '#ff3b80'; ctx.shadowBlur = glow;
    ctx.fillStyle = `rgba(${Math.round(224 + 31 * beat)},${Math.round(42 + 68 * beat)},${Math.round(112 + 53 * beat)},${intensity})`;
    ctx.beginPath(); ctx.roundRect(-size / 2, -size / 2, size, size, roundness); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = `rgba(255,168,194,${.18 + .45 * beat})`;
    ctx.fillRect(-size * .28, -size * .3, size * .55, size * .52);
    ctx.strokeStyle = `rgba(255,84,144,${.08 + .25 * beat})`; ctx.lineWidth = .65;
    ctx.beginPath(); ctx.ellipse(0, 0, size * .8, size * .7, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawHead(ctx, time) {
    ctx.beginPath(); ctx.ellipse(0, -33, 6.2, 7.3, 0, 0, TAU);
    ctx.fillStyle = 'rgba(9,41,39,0.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(132,229,211,0.83)'; ctx.lineWidth = 0.9; ctx.stroke();
    path(ctx, [{ x: -4.5, y: -34.5 }, { x: 0, y: -29 }, { x: 4.5, y: -34.5 }], 'rgba(91,178,158,0.48)', 0.55);
    ctx.fillStyle = 'rgba(205,255,238,0.92)';
    ctx.fillRect(-3.7, -37.2, 1.6, 1.8); ctx.fillRect(2.1, -37.2, 1.6, 1.8);
    for (const side of [-1, 1]) {
      const sway = Math.sin(time * 2 + side) * 2;
      ctx.beginPath(); ctx.moveTo(side * 3.5, -38);
      ctx.quadraticCurveTo(side * 6.5, -48, side * (15 + sway), -56);
      ctx.strokeStyle = 'rgba(191,236,222,0.69)'; ctx.lineWidth = 0.85; ctx.stroke();
    }
  }

  /**
   * 绘制蜘蛛。坐标为舞台绝对坐标，time 秒，vx/vy 像素速度。
   */
  function drawSpider(ctx, opts = {}) {
    const x = finite(opts.x), y = finite(opts.y);
    const time = finite(opts.time);
    const vx = finite(opts.vx), vy = finite(opts.vy);
    const speed = Math.hypot(vx, vy);
    const phase = finite(opts.phase);
    const heartbeat = heartbeatAt(time);
    const restingHeading = 1.22 + Math.sin(time * 0.47 + 0.8) * 0.08;
    const directionalWeight = speed * speed / (speed * speed + 32 * 32);
    const normalizer = Math.max(speed, 1);
    const heading = Math.atan2(
      vx / normalizer * directionalWeight + Math.sin(restingHeading) * (1 - directionalWeight),
      -vy / normalizer * directionalWeight + Math.cos(restingHeading) * (1 - directionalWeight),
    );
    const cos = Math.cos(heading), sin = Math.sin(heading);
    const stretchX = 1 - Math.min(speed / 2200, 0.055);
    const stretchY = 1 + Math.min(speed / 2800, 0.035);
    const breathing = Math.sin(time * 2.4) * 0.45;
    const localVelocity = speed > 2
      ? { x: (vx * cos + vy * sin) / normalizer, y: (-vx * sin + vy * cos) / normalizer }
      : { x: 0.12, y: 0.99 };
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0; ctx.setLineDash([]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.translate(x, y + breathing); ctx.rotate(heading); ctx.scale(stretchX, stretchY);
    drawFeelers(ctx, time, finite(opts.activeProbes));
    drawLegs(ctx, time, phase, speed, localVelocity);
    drawWireBody(ctx, time, heartbeat);
    drawHead(ctx, time);
    ctx.restore();
    return { x, y, heading, heartbeat };
  }

  /* ---------------- 触手抓取探针 ---------------- */
  const PROBE_TIMING = Object.freeze({ reach: 0.26, hold: 0.26, retract: 0.26 });

  function seedFor(event) {
    let seed = (finite(event.index) + 1) * 2654435761 >>> 0;
    for (const ch of String(event.word ?? '')) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    return seed;
  }

  function probePose(event, time, body) {
    const seed = seedFor(event);
    const x = finite(body?.x), y = finite(body?.y);
    const target = { x: finite(event.target?.x, x), y: finite(event.target?.y, y) };
    const dx = target.x - x, dy = target.y - y;
    const distance = Math.hypot(dx, dy);
    const ux = distance > 0.001 ? dx / distance : Math.cos(seed % 628 / 100);
    const uy = distance > 0.001 ? dy / distance : Math.sin(seed % 628 / 100);
    const side = seed & 1 ? 1 : -1;
    const launchTime = finite(event.launchTime);
    const start = launchTime - PROBE_TIMING.reach;
    const holdEnd = launchTime + PROBE_TIMING.hold;
    const end = holdEnd + PROBE_TIMING.retract;
    const visible = Number.isFinite(time) && time >= start && time < end;
    let phase = 'idle', phaseProgress = 0, extension = 0, contact = false;
    if (visible && time < launchTime) {
      phase = 'reach'; phaseProgress = clamp((time - start) / PROBE_TIMING.reach);
      extension = smooth(phaseProgress ** 1.35);
    } else if (visible && time < holdEnd) {
      phase = 'hold'; phaseProgress = clamp((time - launchTime) / PROBE_TIMING.hold);
      extension = 1; contact = true;
    } else if (visible) {
      phase = 'retract'; phaseProgress = clamp((time - holdEnd) / PROBE_TIMING.retract);
      extension = 1 - smooth(phaseProgress ** 0.9);
    }
    const radius = 1 / Math.sqrt(ux * ux / (23 * 23) + uy * uy / (29 * 29));
    const restRadius = Math.min(54 + seed % 10, Math.max(radius + 7, distance - 12));
    const restingTip = { x: x + ux * restRadius, y: y + uy * restRadius };
    const motionPulse = phase === 'idle' || phase === 'hold' ? 0 : Math.sin(Math.PI * phaseProgress) ** 2;
    const sweepSize = clamp((distance - radius) * 0.27, 18, 35);
    const lateral = side * sweepSize * motionPulse * (phase === 'retract' ? -0.93 * (1 + 0.15 * Math.sin(2 * Math.PI * phaseProgress)) : 1);
    const hook = phase === 'retract' ? 5.5 * motionPulse * Math.sin(2 * Math.PI * phaseProgress) : 0;
    const tip = {
      x: mix(restingTip.x, target.x, extension) - uy * lateral + ux * hook,
      y: mix(restingTip.y, target.y, extension) + ux * lateral + uy * hook,
    };
    const fold = (20 + seed % 9) * (1 - extension * 0.65);
    const tremor = Math.sin(time * 5.1 + seed % 97) * 1.3 * extension;
    const bend = side * (fold + tremor + (phase === 'retract' ? -39 : 24) * motionPulse);
    const rootPt = { x: x + ux * radius, y: y + uy * radius };
    const joints = [
      { x: mix(rootPt.x, tip.x, 0.34) - uy * bend, y: mix(rootPt.y, tip.y, 0.34) + ux * bend },
      { x: mix(rootPt.x, tip.x, 0.72) + uy * bend * 0.36, y: mix(rootPt.y, tip.y, 0.72) - ux * bend * 0.36 },
    ];
    const fade = phase === 'reach' ? clamp(phaseProgress / 0.26) : phase === 'retract' ? clamp((1 - phaseProgress) / 0.25) : 1;
    return {
      event, phase, phaseProgress, extension, visible, contact, start, end,
      root: rootPt, joints, tip, target, distance,
      fingerOpening: phase === 'hold' ? 1.1 * Math.sin(Math.PI * phaseProgress) ** 2 : motionPulse * (phase === 'reach' ? 3 : 1.8),
      opacity: visible ? fade : 0,
      width: Math.max(8, finite(event.width, String(event.word ?? '').length * 7.5)),
    };
  }

  function cubic(pose, f) {
    const back = 1 - f;
    const [a, b] = pose.joints;
    return {
      x: back ** 3 * pose.root.x + 3 * back * back * f * a.x + 3 * back * f * f * b.x + f ** 3 * pose.tip.x,
      y: back ** 3 * pose.root.y + 3 * back * back * f * a.y + 3 * back * f * f * b.y + f ** 3 * pose.tip.y,
    };
  }

  function sampleChain(pose) {
    const points = [{ point: pose.root, length: 0 }];
    let length = 0;
    for (let index = 1; index <= 40; index++) {
      const point = cubic(pose, index / 40), previous = points.at(-1).point;
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      points.push({ point, length });
    }
    return { points, length };
  }

  function chainPoint(chain, length) {
    let index = 1;
    while (index < chain.points.length - 1 && chain.points[index].length < length) index++;
    const a = chain.points[index - 1], b = chain.points[index];
    const f = (length - a.length) / Math.max(0.001, b.length - a.length);
    return { x: mix(a.point.x, b.point.x, f), y: mix(a.point.y, b.point.y, f) };
  }

  function drawArm(ctx, pose) {
    const [a, b] = pose.joints;
    ctx.globalAlpha = pose.opacity;
    ctx.beginPath(); ctx.moveTo(pose.root.x, pose.root.y);
    ctx.bezierCurveTo(a.x, a.y, b.x, b.y, pose.tip.x, pose.tip.y);
    ctx.lineWidth = 0.65;
    ctx.strokeStyle = 'rgba(189,221,213,0.43)'; ctx.stroke();
    const chain = sampleChain(pose);
    ctx.fillStyle = 'rgba(238,255,247,0.92)';
    for (let along = 3; along < chain.length - 1; along += 5.6) {
      const point = chainPoint(chain, along);
      const size = along > chain.length - 14 ? 1.9 : 1.65;
      ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    }
    ctx.fillStyle = '#effff5';
    ctx.fillRect(pose.tip.x - 1.05, pose.tip.y - 1.05, 2.1, 2.1);

    const closing = pose.extension ** 5;
    const halfWidth = mix(4.2, pose.width / 2 + 2, closing) + pose.fingerOpening;
    const halfHeight = mix(7.6, 7, closing) + pose.fingerOpening * 0.35;
    const finger = mix(2.6, 4.2, closing);
    ctx.strokeStyle = `rgba(231,255,243,${0.53 + closing * 0.4})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const edge = pose.tip.x + side * halfWidth;
      ctx.moveTo(edge - side * finger, pose.tip.y - halfHeight);
      ctx.lineTo(edge, pose.tip.y - halfHeight);
      ctx.lineTo(edge, pose.tip.y + halfHeight);
      ctx.lineTo(edge - side * finger, pose.tip.y + halfHeight);
    }
    ctx.stroke();
  }

  function drawContact(ctx, pose, accent) {
    if (!pose.contact) return;
    const { event, target, width } = pose;
    ctx.globalAlpha = pose.opacity;
    ctx.fillStyle = 'rgba(193,248,223,0.12)';
    ctx.fillRect(target.x - width / 2 - 2, target.y - 7, width + 4, 14);
    ctx.strokeStyle = 'rgba(224,255,241,0.78)'; ctx.lineWidth = 0.55;
    ctx.strokeRect(target.x - width / 2 - 2, target.y - 7, width + 4, 14);
    const score = clamp(finite(event.score, 0.95)).toFixed(2);
    const label = `${event.label || '因子校验'} p ${score}`;
    ctx.font = '10px Consolas, monospace';
    const labelWidth = ctx.measureText(label).width + 7;
    const labelX = Math.max(4, target.x - width / 2);
    const labelY = target.y - 23;
    ctx.fillStyle = accent; ctx.fillRect(labelX, labelY, labelWidth, 12);
    ctx.fillStyle = '#10241c'; ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX + 3.5, labelY + 6.4);
    ctx.textBaseline = 'alphabetic';
  }

  function drawProbes(ctx, opts = {}) {
    const time = finite(opts.time);
    const body = opts.body ?? { x: 0, y: 0 };
    const maximum = clamp(Math.round(finite(opts.maxVisible, 12)), 1, 12);
    const poses = (opts.events ?? []).map(event => probePose(event, time, body))
      .filter(pose => pose.visible && pose.distance > 30)
      .sort((a, b) => b.event.launchTime - a.event.launchTime || a.event.index - b.event.index)
      .slice(0, maximum).reverse();
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pose of poses) drawArm(ctx, pose);
    for (const pose of poses) drawContact(ctx, pose, opts.accent || '#f23c83');
    ctx.restore();
    return poses;
  }

  window.SpiderCore = { drawSpider, drawProbes, clamp, finite, mix, smooth, fraction };
})();
