/** @jsx React.DOM */
function shuffle(a) {
  for (var i = 0; i < a.length; ++i) {
    var swap = Math.random() * (a.length - i) + i | 0;
    if (swap != i) {
      var tmp = a[swap];
      a[swap] = a[i];
      a[i] = tmp;
    }
  }
}
var ItemView = React.createClass({displayName: 'ItemView',
  render: function() {
    if (this.props.item) {
      var h = this.props.item.hist;
      var l = h.p(0.1) / h.k;
      var r = h.p(0.9) / h.k;
      return (React.DOM.table(null, React.DOM.tr(null, React.DOM.td(null, 
            this.props.item.title
            ),React.DOM.td(null, 
              React.DOM.div( {style:{'margin-left': l * 100 + 'px',
                            background: 'black',
                            height: '20px',
                            width: (r - l) * 100 + 'px'}})
                            ))));
    } else {
      return React.DOM.span(null);
    }
  }
});
var List = React.createClass({displayName: 'List',
  render: function() {
    var items = this.props.items
    var keys = [];
    for (var k in items) keys.push(k);
    keys = keys.sort(function(a, b) {
      return Item.compare(items[a], items[b]);
    });
    return React.DOM.table( {className:"items"}, 
      keys.map(function(k) {
        console.debug(items[k].hist.h);
        return React.DOM.tr(null, React.DOM.td( {width:"140px"}, ItemView( {item:items[k]})));
      })
      );
  }
});
var MutableList = React.createClass({displayName: 'MutableList',
  mixins: [React.addons.LinkedStateMixin],
  getInitialState: function() {
    return {composer:'',lastKey:null};
  },
  doAdd: function() {
    if (this.state.composer != '') {
      this.props.add(this.state.composer);
      this.state.composer = '';
      this.forceUpdate();
    }
    return false;
  },
  render: function() {
    return(
      React.DOM.div(null, 
        React.DOM.form( {onKeyDown:this.keyDown}, 
          React.DOM.input( {type:"text", placeholder:"nav", onKeyDown:this.navKeyDown} ),
          React.DOM.input( {type:"text", placeholder:"item", valueLink:this.linkState('composer')} ),
          React.DOM.input( {type:"submit", value:"Add", onClick:this.doAdd})
        ),
        List( {items:this.props.items})
      ));
    },
});
var lastEvent = null;
var Sorter = React.createClass({displayName: 'Sorter',
  left: function(e){
    this.props.learnOrder(this.props.right, this.props.left);
    $('#left')[0].focus();
    return false;
  },
  skip: function(e){
    this.props.learnOrder(null, null);
    $('#skip')[0].focus();
    return false;
  },
  right: function(e){
    this.props.learnOrder(this.props.left, this.props.right);
    $('#right')[0].focus();
    return false;
  },
  key: function(e) {
    switch (e.keyCode) {
      case 37: return this.left(e);
      case 39: return this.right(e);
      case 40: return this.skip(e);
    }
    return true;
  },
  render: function() {
    return (React.DOM.form(null, 
      React.DOM.table(null, 
        React.DOM.tr(null, 
          React.DOM.td( {className:"option"}, 
            ItemView( {item:this.props.left} )
          ),
          React.DOM.td(null),
          React.DOM.td( {className:"option"}, 
            ItemView( {item:this.props.right} )
          )
        ),
        React.DOM.tr(null, 
          React.DOM.td(null, React.DOM.input( {id:"left", type:"submit", value:"bigger", onClick:this.left, onKeyDown:this.key}), " " ),
          React.DOM.td(null, React.DOM.input( {id:"skip", type:"submit", value:"skip", onClick:this.skip, onKeyDown:this.key}), " " ),
          React.DOM.td(null, React.DOM.input( {id:"right", type:"submit", value:"bigger", onClick:this.right, onKeyDown:this.key}))
        )
      )
    ));
  },
});
function Histogram(n) {
  var self = this;
  self.h = new Float32Array(n);
  self.k = n;
  self.normalize = function() {
    var s = 0;
    for (var i = 0; i < n; ++i) {
      s += self.h[i];
    }
    if (s > 0.00001) {
      for (var i = 0; i < n; ++i) {
        self.h[i] /= s;
      }
    }
    return self;
  };
  self.entropy = function() {
    var e = 0;
    for (var i = 0; i < self.k; ++i) {
      if (self.h[i])
        e -= self.h[i] * Math.log(self.h[i]) / Math.log(2);
    }
    return e;
  };
  self.mean = function() {
    var s = 0, d = 0;
    for (var i = 1; i < self.k; ++i) {
      s += i * self.h[i];
      d += i;
    }
    return s / d;
  };
  self.p = function(t) {
    var i = 0;
    var s1 = 0, s2 = 0;
    for (; i < self.k; ++i) {
      s2 = s1 + self.h[i];
      if (s2 >= t) break;
      s1 = s2;
    }
    if (s2 > s1) 
      return i + (t - s1) / (s2 - s1);
    else
      return i;
  };
}
Histogram.even = function(n) {
  var r = new Histogram(n);
  for (var i = 0; i < n; ++i) {
    r.h[i] = 1.0 / n;
  }
  return r;
};
Histogram.zero = function(n) {
  return new Histogram(n);
};
Histogram.and = function(a, b) {
  var s = 0;
  for (var i = 0; i < a.k && i < b.k; ++i) {
    s += Math.sqrt(a.h[i]) * Math.sqrt(b.h[i]);
  }
  return s;
};
Histogram.order = function(a, b) {
  if (a.k != b.k)
    return null;
  var n = a.k;
  var a2 = Histogram.zero(n);
  var b2 = Histogram.zero(n);
  var s = 0;
  for (var i = 0; i < n; ++i) {
    for (var j = 0; j < n; ++j) {
      if (i < j) {
        var p = a.h[i] * b.h[j];
        a2.h[i] += p;
        b2.h[j] += p;
        s += p;
      }
    }
  }
  if (!s) {
    return null;
  }
  a2.normalize();
  b2.normalize();
  return [a2, b2];
};
function Item(x) {
  var self = this;
  self.title = x;
  self.clear = function(n) {
    self.hist = Histogram.even(n);
    self.lessers = [];
    self.greaters = [];
  };
  self.clear(0);
};
Item.compare = function(a, b) {
  return a.hist.mean() - b.hist.mean();
};
Item.order = function(a, b) {
  function orderOne(a, b) {
    var hs = Histogram.order(a.hist, b.hist);
    if (!hs)
      return;
    a.hist = hs[0];
    b.hist = hs[1];
  }
  function applyUp(x) {
    if (-1 != x.lessers.indexOf(a) ||
        x == b)
      return;
    orderOne(a, x);
    for (var i in x.greaters) {
      applyUp(x.greaters[i]);
    }
    x.lessers.push(a);
  }
  function applyDown(x) {
    if (-1 != x.greaters.indexOf(b) ||
        x == a)
      return;
    orderOne(x, b);
    for (var i in x.lessers) {
      applyDown(x.lessers[i]);
    }
    x.greaters.push(b);
  }
  var a1 = a.hist, b1 = b.hist;
  applyUp(b)
  applyDown(a)
  a.hist = a1;
  b.hist = b1;
  orderOne(a, b);
};
function Model() {
  var self = this;
  self.count = 0;
  self.items = {};
  this.setup = function(x) {
    for (var k in self.items) {
      self.items[k].clear(self.count);
    }
  };
  this.add = function(x) {
    var key = self.count;
    ++self.count;
    self.items[key] = new Item(x);
    self.setup();
  };
}
var m = new Model();
var sorter = null, view = null;
function newPair() {
  var n = m.count;
  if (n > 1) {
    var gain = -n;
    var a, b;
    for (var i = 0; i < n; ++i) {
      for (var j = i + 1; j < n; ++j) {
        var ha = m.items[i].hist;
        var hb = m.items[j].hist;
        var ea1 = ha.entropy();
        var eb1 = hb.entropy();
        var case1 = Histogram.order(ha, hb);
        var case2 = Histogram.order(hb, ha);
        if (!case1) { case1 = case2; }
        if (!case2) { case2 = case1; }
        var ea2 = Math.max(case1[0].entropy(), case2[1].entropy());
        var eb2 = Math.max(case1[1].entropy(), case2[0].entropy());
        
        var newGain = ea1 + eb1 - ea2 - eb2;

        if (newGain > gain) {
          a = i;
          b = j;
          gain = newGain;
        }
      }
    }
    sorter.props.left = m.items[a];
    sorter.props.right = m.items[b];
    sorter.forceUpdate();
  }
}
function addItem(x) {
  m.add(x);
  newPair();
}
function learnOrder(a, b) {
  if (a || b) {
    Item.order(a, b);
    view.forceUpdate();
  }
  newPair();
}
view = React.renderComponent(MutableList( {items:m.items, add:addItem, sorter:m.sort}), $('#list')[0]);
sorter = React.renderComponent(Sorter( {learnOrder:learnOrder}), $('#sorter')[0]);
