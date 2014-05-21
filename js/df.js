function sigmoid(x) { return 1.0 / (1.0 + Math.exp(-x)); }; 
var n = 10;
var model = {
  theta: numeric.rep([n, 1], 0),
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
    var grad = numeric.dot(numeric.transpose(this.X), numeric.sub(H, this.y));
    grad = numeric.div(grad, this.X.length);
    return numeric.add(grad, regularization);
  },
  descend: function(alpha, lambda) {
    if (!this.X.length) return;
    this.theta = numeric.sub(
      this.theta,
      numeric.mul(this.gradient(lambda), alpha));
  },
};

window.onload = function() {
  var width = 600,
  height = 500,
  radius = 10;

  var fill = d3.scale.category10();

  var nodes = d3.range(n).map(function(i) {
    return {index: i, value: (Math.random() * 10 | 0) - 5};
  });

  d3.select("body")
  .on("keydown", undo);
  var svg = d3.select("body").append("svg")
  .attr("width", width)
  .attr("height", height);

  var lessers = [];
  function ignore() {
    d3.event.preventDefault();
  }
  function click(d, i, e) {
    if (d3.event.button == 0) {
      lessers.forEach(function(j) {
        var row = numeric.rep([n], 0);
        row[i] = -1;
        row[j] = 1;
        model.X.push(row);
        model.y.push([1]);
      });
      lessers = [];
    } else if (d3.event.button == 2) {
      lessers.push(i);        
    }
    d3.event.preventDefault();
  }
  function undo() {
    d3.event.preventDefault();
    if (d3.event.keyCode != 8) {
      return;
    }
    if (!model.X.length) {
      return;
    }
    model.X.pop();
    model.y.pop();
  }

  var node = svg.selectAll(".node")
  .data(nodes)
  .enter().append("circle")
  .attr("class", "node")
  .attr("cx", function(d, i) {
     return i * radius * 2 + width / 2;
   })
  .attr("cy", function(d) { return d.y; })
  .attr("r", radius)
  .style("fill", function(d, i) { return fill(i % 10); })
  .style("stroke", function(d, i) { return d3.rgb(fill(i % 10)).darker(2); })
  .on("contextmenu", ignore)
  .on("mousedown", click);

  svg.style("opacity", 1e-6)
  .transition()
  .duration(1000)
  .style("opacity", 1);

  function tick() {
    model.descend(1, 0.01);
    node
    .attr("cy", function(d, i) { 
      return model.theta[i][0] * radius * 2 + height / 2;
    });
    return false;
  }
  d3.timer(tick, 5);
}
