"use strict";
var g = {}; // globals
var gl;
function init() {
  // Initialize
  gl = initWebGL("drawCanvas");
  if (!gl) {
    return;
  }
  g.program = simpleSetup(
      gl,
      // The ids of the vertex and fragment shaders
      "vshader", "fshader",
      // The vertex attribute names used by the shaders.
      // The order they appear here corresponds to their index
      // used later.
      [ "vNormal", "vColor", "vPosition"],
      // The clear color and depth values
      [ 0, 0, 0, 1 ], 10000);
  g.box = makeQuad(gl);

  // Create some matrices to use later and save their locations in the shaders
  g.mvMatrix = new J3DIMatrix4();
  g.u_normalMatrixLoc =
    gl.getUniformLocation(g.program, "u_normalMatrix");
  g.normalMatrix = new J3DIMatrix4();
  g.u_modelViewProjMatrixLoc =
    gl.getUniformLocation(g.program, "u_modelViewProjMatrix");
  g.mvpMatrix = new J3DIMatrix4(); 

  // Set up a uniform variable for the shaders
  g.uni_MaxRe = gl.getUniformLocation(g.program, "MaxRe");
  g.uni_MinRe = gl.getUniformLocation(g.program, "MinRe");
  g.uni_MaxIm = gl.getUniformLocation(g.program, "MaxIm");
  g.uni_MinIm = gl.getUniformLocation(g.program, "MinIm");

  g.uni_Im_Factor = gl.getUniformLocation(g.program, "Im_factor");
  g.uni_Re_Factor = gl.getUniformLocation(g.program, "Re_factor");

  g.uni_maxIter = gl.getUniformLocation(g.program, "maxIter");

  // bind only the quad vertex and index arrays
  gl.enableVertexAttribArray(2);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.box.vertexObject);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.box.indexObject);

  return gl;
}

var width = -1;
var height = -1;
var requestId = null;
var maxIter = 500;
var canvas;

function reshape(gl) {
  canvas = document.getElementById('drawCanvas');
  if (width!=-1) return;

  width = canvas.width;
  height = canvas.height;

  // Set the viewport and projection matrix for the scene
  gl.viewport(0, 0, width, height);
  g.perspectiveMatrix = new J3DIMatrix4();
  g.perspectiveMatrix.ortho(1, -1, -1, 1, 10, -10);

  gl.uniform1iv(g.uni_maxIter, [maxIter]);

  // Make a model/view matrix.
  g.mvMatrix.makeIdentity();

  // Construct the normal matrix from the model-view matrix and pass it in
  g.normalMatrix.load(g.mvMatrix);
  g.normalMatrix.invert();
  g.normalMatrix.transpose();

  // Construct the model-view * projection matrix and pass it in
  g.mvpMatrix.load(g.perspectiveMatrix);
  g.mvpMatrix.multiply(g.mvMatrix);
  g.mvpMatrix.setUniform(gl, g.u_modelViewProjMatrixLoc, false);
}

function makeQuad(ctx) {
  var vertices = new Float32Array([ 1, 1, 1,
      -1, 1, 1,
      -1,-1, 1,
      1,-1, 1 ]);
  var indices = new Uint8Array([0, 1, 2,
      0, 2, 3 ]);
  var retval = {};

  retval.vertexObject = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.vertexObject);
  ctx.bufferData(ctx.ARRAY_BUFFER, vertices, ctx.STATIC_DRAW);
  ctx.bindBuffer(ctx.ARRAY_BUFFER, null);

  retval.indexObject = ctx.createBuffer();
  ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, retval.indexObject);
  ctx.bufferData(ctx.ELEMENT_ARRAY_BUFFER, indices, ctx.STATIC_DRAW);
  ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, null);
  retval.numIndices = indices.length;

  return retval;
}

function drawPicture(gl) {
  // Make sure the canvas is sized correctly.
  reshape(gl);

  // Clear the canvas
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  interpolate();
  updateBounds();
  gl.drawElements(gl.TRIANGLES, g.box.numIndices, gl.UNSIGNED_BYTE, 0);
}

function start() {
  var c = document.getElementById("drawCanvas");

  c.addEventListener('webglcontextlost', handleContextLost, false);
  c.addEventListener('webglcontextrestored', handleContextRestored, false);

  c.addEventListener('mousedown', canvasClick, false);
  c.addEventListener('mouseup', canvasRelease, false);
  c.addEventListener('mousemove', canvasMove, false);
  c.addEventListener('mousewheel', canvasWheel, false);

  var gl = init();
  if (!gl) return;

  reshape(gl);

  function renderLoop() {
    drawPicture(gl);
    requestId = window.requestAnimFrame(renderLoop, c);
  }

  updateBounds();

  renderLoop();

  function handleContextLost(e) {
    e.preventDefault();
    if (requestId !== null) {
      window.cancelRequestAnimFrame(requestId);
      requestId = undefined;
    }
  }

  function handleContextRestored() {
    init();
    renderLoop();
  }
}

var position = { r: 0, i: 0, e: 0.1 };
var targetPosition = { r: -0.5, i: 0, e: 1.5 };

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function interpolate() {
  position.r = lerp(position.r, targetPosition.r, 1/1);
  position.i = lerp(position.i, targetPosition.i, 1/1);
  position.e = lerp(position.e, targetPosition.e, 1/1);
}

function updateBounds() {
  var p = position;
  var ve = height * p.e / width;
  var px = p.e / width;
  gl.uniform1fv(g.uni_MaxRe, [p.r + p.e]);
  gl.uniform1fv(g.uni_MinRe, [p.r - p.e]);
  gl.uniform1fv(g.uni_MinIm, [p.i - ve]);
  gl.uniform1fv(g.uni_MaxIm, [p.i + ve]);
  gl.uniform1fv(g.uni_Re_Factor, [px*2]);
  gl.uniform1fv(g.uni_Im_Factor, [px*2]);
}

function zoom(relAmount) {
  targetPosition.e *= Math.pow(0.5, relAmount);
}

var clickPos;
var mouseDrag;

function mousePos(e) {
  return { x:e.offsetX, y:e.offsetY };
}

function canvasClick(e) {
  clickPos = mousePos(e);
  mouseDrag = true;
}

function canvasRelease(e) {
  mouseDrag = false;
}

function translate(r, i) {
  var s = position.e * 2 / width;
  targetPosition.r -= r * s;
  targetPosition.i -= i * s;
}

function canvasMove(e){
  if (mouseDrag) {
    var c = document.getElementById("drawCanvas");
    var p = mousePos(e);
    var mIncX = p.x - clickPos.x;
    var mIncY = p.y - clickPos.y;
    clickPos = p;
    translate(mIncX, mIncY);
  }
}

function canvasWheel(e) {
  zoom(e.wheelDelta / 500.0);
  e.preventDefault();
}
