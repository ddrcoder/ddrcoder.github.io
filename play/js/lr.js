function kernel(a, b) { return [1, a, b, a * a, b * b, a * b]; } 
function sigmoid(x) { return 1.0 / (1.0 + Math.exp(-x)); }; 
function render(gfx, theta, X, y) {
    var thetaT = numeric.transpose(theta);
    gfx.scale(10);
    // Render background
    for (var i = 0; i < 40; i++) {
        for (var j = 0; j < 40; j++) {
            var a = j / 20 - 1;
            var b = i / 20 - 1;
            var x = numeric.transpose([kernel(a, b)]);
            var value = sigmoid(numeric.dot(thetaT, x)[0][0]);
            gfx.stroke(255 * value, 100, 255 * (1 - value));
            gfx.point(j, i);
        }
    }
    gfx.scale(0.1);
    gfx.stroke(0);
    // Render points
    for (var i = 0; i < X.length; i++) {
        if (y[i][0] > 0.5) {
            gfx.fill(255, 100, 50);
        } else {
            gfx.fill(50, 100, 255);
        }
        gfx.ellipse((X[i][1] + 1) * 200, (X[i][2] + 1) * 200, 5, 5);
    }
}

var model = {
  theta: numeric.rep([kernel(0, 0).length, 1], 0),
  X: [],
  y: [],
  gradient: function(lambda) {
    var H = numeric.dot(this.X, this.theta);
    for (var i = 0; i < H.length; i++) {
      for (var j = 0; j < H[i].length; j++) {
        H[i][j] = sigmoid(H[i][j]);
      }
    }
    var regularization = numeric.mul(this.theta, lambda / this.X.length);
    regularization[0][0] = 0.0;
    var grad = numeric.dot(numeric.transpose(this.X), numeric.sub(H, this.y));
    grad = numeric.div(grad, this.X.length);
    return numeric.add(grad, regularization);
  },
  descend: function(alpha, lambda) {
    this.theta = numeric.sub(
        this.theta,
        numeric.mul(this.gradient(lambda), alpha));
  },
};

window.onload = (function() {
    // Alpha input
    var alpha = document.getElementById('alpha').value;
    var alphaInput = document.getElementById('alpha');
    alphaInput.onchange = function() {
        alpha = parseFloat(alphaInput.value);
    };

    // Lambda input
    var lambda = document.getElementById('lambda').value;
    var lambdaInput = document.getElementById('lambda');
    lambdaInput.onchange = function() {
        lambda = parseFloat(lambdaInput.value);
    };

    // Group input
    var group = document.getElementById('group').value;
    var groupInput = document.getElementById('group');
    groupInput.onchange = function() {
        group = parseFloat(groupInput.value);
    };


    // Canvas for rendering
    var canvas = document.getElementById('canvas');
    var gfx = new Processing(canvas);

    canvas.onclick = function(evt) {
        if (typeof evt.offsetX == 'undefined'){
             evt.offsetX = evt.layerX - canvas.offsetLeft;
        }
        if (typeof evt.offsetY == 'undefined'){
             evt.offsetY = evt.layerY - canvas.offsetTop;
        }
        var a = (evt.offsetX / 200) - 1;
        var b = (evt.offsetY / 200) - 1;
        model.X.push(kernel(a, b));
        model.y.push([group]);
    };

    gfx.size(400, 400);

    function loop() {
      if (model.X.length) {
        for (var i = 0; i < 100; i++) {
          model.descend(alpha, lambda);
        }
      }
      render(gfx, model.theta, model.X, model.y);
      setTimeout(loop, 10);
    }
    loop();
});
