import { useEffect } from 'react';
import './styles.css';

const studioMarkup = `<div class="app">
  <header>
    <div class="brand">
      <div class="logo"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 6.5 12 11l9-4.5M12 11v11" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
      <div><div class="name">BLOCKPOSE</div><div class="sub">Skin Studio</div></div>
    </div>

    <div class="src-bar">
      <div class="seg" id="srcSeg">
        <button class="on" data-src="name">Username / UUID</button>
        <button data-src="upload">Upload skin</button>
      </div>
      <div class="field" id="nameField">
        <input id="nameInput" type="text" value="actualPUG" placeholder="e.g. Notch, jeb_, or a UUID…" autocomplete="off" spellcheck="false">
        <button class="go" id="loadBtn">Load</button>
      </div>
      <div class="field" id="uploadField" style="display:none;cursor:pointer">
        <input id="uploadName" type="text" placeholder="Choose a .png skin file…" readonly style="cursor:pointer">
        <button class="go" id="browseBtn">Browse</button>
      </div>
    </div>

    <div class="head-right">
      <div class="model-seg" id="modelSeg" title="Arm model">
        <button class="on" data-model="auto-detect">Auto</button>
        <button data-model="default">Classic</button>
        <button data-model="slim">Slim</button>
      </div>
      <button class="btn-export" id="quickExport"><svg viewBox="0 0 24 24" fill="none"><path d="M12 15V3m0 12-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Export</button>
    </div>
  </header>

  <main>
    <section class="stage" id="stage">
      <div class="statuschip" id="statusChip"><span class="dot"></span><span id="statusText">No skin loaded</span></div>

      <div class="canvas-frame" id="canvasFrame">
        <div id="bgLayer"></div>
        <canvas id="viewer" width="440" height="560"></canvas>
        <div id="vignetteLayer"></div>
        <div id="grainLayer"></div>
      </div>

      <div class="thumb-frame" id="thumbFrame"><span class="tf-lbl">16:9 THUMBNAIL FRAME</span></div>

      <div class="dropmsg" id="dropMsg"><div class="box"><h3>Drop your skin here</h3><p>64×64 or 64×32 PNG · classic or slim</p></div></div>
      <div class="overlay-load" id="loadOverlay"><div class="ld"><div class="ring"></div><p id="loadMsg">Loading skin…</p></div></div>

      <div class="toolbar" id="toolbar">
        <button class="tool" data-view="front" title="Front"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span class="lbl">Front</span></button>
        <button class="tool" data-view="three" title="3/4"><svg viewBox="0 0 24 24" fill="none"><path d="M9 4.5 4 7v10l5 2.5 11-3V7L9 4.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="lbl">3/4</span></button>
        <button class="tool" data-view="side" title="Side"><svg viewBox="0 0 24 24" fill="none"><path d="M8 4h3v16H8zM13 4h3v16h-3z" stroke="currentColor" stroke-width="1.5"/></svg><span class="lbl">Side</span></button>
        <button class="tool" data-view="back" title="Back"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M18.5 20c0-3.6-2.9-6-6.5-6S5.5 16.4 5.5 20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span class="lbl">Back</span></button>
        <div class="tdiv"></div>
        <button class="tool" id="spinTool" title="Auto-rotate"><svg viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v4h-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="lbl">Spin</span></button>
        <button class="tool" id="resetView" title="Reset camera"><svg viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 1 1 9 9M3 12l3-3m-3 3 3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg><span class="lbl">Recenter</span></button>
        <button class="tool" id="resetPoseTool" title="Reset pose"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span class="lbl">Rest pose</span></button>
      </div>
    </section>

    <aside class="inspector">
      <div class="tabs" id="tabs">
        <button class="on" data-tab="pose"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="4.5" r="2.2" stroke="currentColor" stroke-width="1.7"/><path d="M12 6.7v6m0 0-4 5m4-5 4 5m-8-9 4 1.5 4-1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>Pose</button>
        <button data-tab="filters"><svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.7"/><circle cx="15" cy="15" r="5.5" stroke="currentColor" stroke-width="1.7"/></svg>Filters</button>
        <button data-tab="scene"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="m3 16 5-4 4 3 3-3 6 5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="8" cy="9" r="1.4" fill="currentColor"/></svg>Scene</button>
        <button data-tab="thumb"><svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="m10 9 5 3-5 3V9Z" fill="currentColor"/></svg>Thumb</button>
        <button data-tab="export"><svg viewBox="0 0 24 24" fill="none"><path d="M12 15V3m0 12-3.5-3.5M12 15l3.5-3.5M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>Export</button>
      </div>

      <div class="panes" id="panes">
        <!-- POSE -->
        <div class="pane on" data-pane="pose">
          <div class="group">
            <div class="group-h"><h4>Animations</h4><div class="hr"></div><span class="tag">Live</span></div>
            <div class="chips" id="animChips"></div>
            <div class="row" style="margin-top:13px"><div class="rl">Speed</div><div class="slider"><input type="range" id="animSpeed" min="0.2" max="3" step="0.1" value="1"><span class="val" id="animSpeedV">1.0×</span></div></div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Static Poses</h4><div class="hr"></div><span class="tag">Snap</span></div>
            <div class="pose-grid" id="poseGrid"></div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Manual Rig</h4><div class="hr"></div><span class="tag">Degrees</span></div>
            <div id="rig"></div>
            <div class="row" style="margin-top:6px"><div class="rl">Body turn</div><div class="slider"><input type="range" id="bodyYaw" min="-180" max="180" step="1" value="0"><span class="val" id="bodyYawV">0°</span></div></div>
            <div class="row"><div class="rl">Body tilt</div><div class="slider"><input type="range" id="bodyPitch" min="-90" max="90" step="1" value="0"><span class="val" id="bodyPitchV">0°</span></div></div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Pose Library</h4><div class="hr"></div><span class="tag">Save</span></div>
            <div class="btn-pair">
              <button class="action ghost" id="savePose"><svg viewBox="0 0 24 24" fill="none"><path d="M5 3h11l3 3v15H5V3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 3v6h7M8 21v-7h8v7" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>Save current</button>
              <button class="action ghost" id="importPose"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0-12L8 7m4-4 4 4M5 21h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>Import .json</button>
            </div>
            <div class="lib" id="poseLib"><span class="empty">No saved poses yet.</span></div>
          </div>
        </div>

        <!-- FILTERS -->
        <div class="pane" data-pane="filters">
          <div class="group">
            <div class="group-h"><h4>Presets</h4><div class="hr"></div><span class="tag">1-tap</span></div>
            <div class="chips" id="filterPresets"></div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Adjust</h4><div class="hr"></div><span class="tag">Manual</span></div>
            <div id="filterSliders"></div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Tint</h4><div class="hr"></div><span class="tag">Color grade</span></div>
            <div class="color-row"><label>Tint color</label><span class="hexlbl" id="tintHex">#ff9d3c</span><div class="swatch"><input type="color" id="tintColor" value="#ff9d3c"></div></div>
            <div class="row"><div class="rl">Strength</div><div class="slider"><input type="range" id="tintAmt" min="0" max="100" step="1" value="0"><span class="val" id="tintAmtV">0%</span></div></div>
          </div>
          <button class="action ghost" id="resetFilters"><svg viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 1 1 9 9M3 12l3-3m-3 3 3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Reset all filters</button>
        </div>

        <!-- SCENE -->
        <div class="pane" data-pane="scene">
          <div class="group">
            <div class="group-h"><h4>Background</h4><div class="hr"></div><span class="tag">Export-baked</span></div>
            <div class="bg-modes" id="bgModes"></div>
            <div id="bgSolid" class="bg-extra"><div class="color-row"><label>Color</label><span class="hexlbl" id="bgSolidHex">#1c1810</span><div class="swatch"><input type="color" id="bgSolidColor" value="#1c1810"></div></div></div>
            <div id="bgGradient" class="bg-extra" style="display:none">
              <div class="color-row"><label>Top</label><span class="hexlbl" id="bgG1Hex">#f6a623</span><div class="swatch"><input type="color" id="bgG1" value="#f6a623"></div></div>
              <div class="color-row"><label>Bottom</label><span class="hexlbl" id="bgG2Hex">#1c1810</span><div class="swatch"><input type="color" id="bgG2" value="#1c1810"></div></div>
              <div class="row"><div class="rl">Angle</div><div class="slider"><input type="range" id="bgGAngle" min="0" max="360" value="180"><span class="val" id="bgGAngleV">180°</span></div></div>
            </div>
            <div id="bgChroma" class="bg-extra" style="display:none">
              <div class="chips" id="chromaChips"></div>
            </div>
            <div id="bgImage" class="bg-extra" style="display:none">
              <div class="uploadbox" id="bgUpload"><svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><p><b>Upload background</b><br>any image</p></div>
              <div class="row" style="margin-top:12px"><div class="rl">Fit</div><div class="seg" id="bgFit" style="flex:1"><button class="on" data-fit="cover">Cover</button><button data-fit="contain">Contain</button><button data-fit="stretch">Stretch</button></div></div>
            </div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Lighting</h4><div class="hr"></div><span class="tag">Studio</span></div>
            <div class="row"><div class="rl">Ambient</div><div class="slider"><input type="range" id="ambLight" min="0" max="200" value="90"><span class="val" id="ambLightV">90%</span></div></div>
            <div class="row"><div class="rl">Key light</div><div class="slider"><input type="range" id="keyLight" min="0" max="200" value="60"><span class="val" id="keyLightV">60%</span></div></div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Render Options</h4><div class="hr"></div><span class="tag">Model</span></div>
            <div class="row"><div class="rl">Skin layer</div><div class="seg skin-layer-seg" id="skinLayerMode" style="flex:1"><button class="on" data-layer="3d">3D</button><button data-layer="flat">Flat</button><button data-layer="off">Off</button></div></div>
            <div class="row"><div class="rl">Layer depth</div><div class="slider"><input type="range" id="skinLayerDepth" min="0.2" max="1" step="0.05" value="0.55"><span class="val" id="skinLayerDepthV">0.55</span></div></div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Extras</h4><div class="hr"></div><span class="tag">Equip</span></div>
            <div class="chips">
              <button class="chip" id="capeToggle"><span class="ic">🧣</span>Add cape</button>
              <button class="chip" id="elytraToggle"><span class="ic">🪽</span>Elytra</button>
            </div>
            <p class="note">Loads the player's own cape when available (from username/UUID), or a default for uploads.</p>
          </div>
        </div>

        <!-- THUMBNAIL -->
        <div class="pane" data-pane="thumb">
          <div class="group">
            <div class="group-h"><h4>Thumbnail Mode</h4><div class="hr"></div><span class="tag">16:9</span></div>
            <button class="action ghost" id="thumbToggle"><svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="m10 9 5 3-5 3V9Z" fill="currentColor"/></svg><span id="thumbToggleLbl">Enable thumbnail composer</span></button>
            <p class="note">Frames a 1280×720 canvas. Compose your pose + background, add a punchy title, then export up to 4K (3840×2160).</p>
          </div>
          <div id="thumbControls" style="display:none">
            <div class="group">
              <div class="group-h"><h4>Title</h4><div class="hr"></div></div>
              <input class="title-in" id="thumbTitle" type="text" placeholder="EPIC NEW UPDATE!!" maxlength="60" style="margin-bottom:9px">
              <input class="title-in" id="thumbSub" type="text" placeholder="subtitle (optional)" maxlength="60">
              <div class="row" style="margin-top:12px"><div class="rl">Size</div><div class="slider"><input type="range" id="thumbFont" min="40" max="140" value="84"><span class="val" id="thumbFontV">84</span></div></div>
              <div class="color-row"><label>Text</label><span class="hexlbl" id="thumbColHex">#ffffff</span><div class="swatch"><input type="color" id="thumbCol" value="#ffffff"></div></div>
              <div class="color-row"><label>Outline</label><span class="hexlbl" id="thumbOutHex">#16130d</span><div class="swatch"><input type="color" id="thumbOut" value="#16130d"></div></div>
              <div class="row"><div class="rl">Outline</div><div class="slider"><input type="range" id="thumbOutW" min="0" max="24" value="10"><span class="val" id="thumbOutWV">10</span></div></div>
            </div>
            <div class="group">
              <div class="group-h"><h4>Layout</h4><div class="hr"></div></div>
              <div class="row"><div class="rl">Text side</div><div class="seg" id="thumbAlign" style="flex:1"><button class="on" data-al="left">Left</button><button data-al="center">Center</button><button data-al="right">Right</button></div></div>
              <div class="row"><div class="rl">Model X</div><div class="slider"><input type="range" id="thumbModelX" min="0" max="100" value="72"><span class="val" id="thumbModelXV">72%</span></div></div>
              <div class="row"><div class="rl">Model size</div><div class="slider"><input type="range" id="thumbModelS" min="50" max="130" value="100"><span class="val" id="thumbModelSV">100%</span></div></div>
            </div>
          </div>
        </div>

        <!-- EXPORT -->
        <div class="pane" data-pane="export">
          <div class="group">
            <div class="group-h"><h4>Format</h4><div class="hr"></div></div>
            <div class="seg" id="fmtSeg" style="width:100%">
              <button class="on" data-fmt="png-trans" style="flex:1">PNG · transparent</button>
              <button data-fmt="png-bg" style="flex:1">PNG · scene</button>
              <button data-fmt="jpg" style="flex:1">JPG</button>
            </div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Aspect</h4><div class="hr"></div></div>
            <div class="size-grid" id="aspectGrid"></div>
          </div>
          <div class="group">
            <div class="group-h"><h4>Resolution</h4><div class="hr"></div><span class="tag">up to 4K</span></div>
            <div class="res-seg" id="resSeg"></div>
            <div class="kv"><span>Output</span><b id="outDims">—</b></div>
          </div>
          <button class="action" id="renderBtn"><svg viewBox="0 0 24 24" fill="none"><path d="M12 15V3m0 12-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>Render &amp; download</button>
          <button class="action ghost" id="copyBtn" style="margin-top:9px"><svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>Copy to clipboard</button>
          <p class="note"><b>Tip:</b> transparent PNG drops straight into any editor. "Scene" bakes your background, filters &amp; grain. Chroma-key backgrounds are ready for green-screen keying.</p>
        </div>
      </div>
    </aside>
  </main>
</div>

<div class="toast" id="toast"><svg class="ti" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="toastMsg">Done</span></div>

<input type="file" id="fileSkin" accept="image/png,image/*" style="display:none">
<input type="file" id="fileBg" accept="image/*" style="display:none">
<input type="file" id="filePose" accept="application/json,.json" style="display:none">`;

export default function App() {
  useEffect(() => {
    document.documentElement.dataset.app = 'blockpose';
    void import('./legacy-app.js');
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: studioMarkup }} />;
}
