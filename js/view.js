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
      return React.DOM.span(null, this.props.item.title);
    } else {
      return React.DOM.span(null);
    }
  }
});
var List = React.createClass({displayName: 'List',
  render: function() {
    var keys = [];
    var items = this.props.items
    for (var k in items) {
      keys.push(k);
    }
    keys.sort(function(k1,k2) {
      return items[k1].compareTo(items[k2]);
    });
    return React.DOM.table( {className:"items"}, 
      keys.map(function(k){
          return React.DOM.tr( {key:k}, React.DOM.td(null, ItemView( {item:items[k]})));
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
    this.props.learnOrder(this.props.left, this.props.right);
    $('#left')[0].focus();
    return false;
  },
  skip: function(e){
    this.props.learnOrder(null, null);
    $('#skip')[0].focus();
    return false;
  },
  right: function(e){
    this.props.learnOrder(this.props.right, this.props.left);
    $('#right')[0].focus();
    return false;
  },
  key: function(e) {
    console.debug('k');
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
          React.DOM.td(null, React.DOM.input( {id:"left", type:"submit", value:"<", onClick:this.left, onKeyDown:this.key}), " " ),
          React.DOM.td(null, React.DOM.input( {id:"skip", type:"submit", value:"=", onClick:this.skip, onKeyDown:this.key}), " " ),
          React.DOM.td(null, React.DOM.input( {id:"right", type:"submit", value:">", onClick:this.right, onKeyDown:this.key}))
        )
      )
    ));
  },
});
function Histogram(n) {
  var self = this;
  self.h = new Float32Array(n);
  self.k = n;
  for (var i = 0; i < n; ++i) {
    self.h[i] = 1.0 / n;
  }
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
      e += self.h[i] * Math.log(self.h[i]) / Math.log(2);
    }
    return e;
  };
  self.and = function(o) {
    var n = self.k;
    var o = new Histogram(n);
    for (var i = 0; i < self.k; ++i) {
      o.h[i] = self.h[i] * o.h[i];
    }
    o.normalize();
    return o;
  };
  self.order = function(next) {
    var n = self.k;
    var o1 = new Histogram(n);
    var o2 = new Histogram(n);
    for (var i = 0; i < n; ++i) {
      for (var j = 0; j < n; ++i) {
        if (i > j) {
          var p = self.h[i] * other.h[j];
          o1.h[i] += p;
          o2.h[j] += p;
        }
      }
    }
    o1.normalize();
    o2.normalize();
    return [h1, h2];
  };
  self.p = function(t) {
    var i = 0;
    var s1 = 0, s2 = 0;
    for (; i < self.k; ++i) {
      s2 = s1 + self.h[i];
      if (s2 > t) break;
    }
    return i + (t - s1) / (s2 - s1);
  };
}
function Item(x) {
  var self = this;
  self.title = x;
  self.compareTo = function(other) {
    return self.value.sum / self.value.count < other.value.sum / other.value.count;
  };
  self.exceed = function(other) {
    var hs = self.hist.order(other.hist);
    self.hist = hs[0];
    other.hist = hs[1];
    console.debug(hs[0]);
    console.debug(hs[1]);
    console.debug(hs[1]);
    sHist2.normalize();
    oHist2.normalize();
  };
};
function Model() {
  var self = this;
  self.count = 0;
  self.items = {};
  this.setup = function(x) {
    for (var k in self.items) {
      self.items[k].hist = new Histogram(self.count);
    }
  };
  this.add = function(x) {
    var key = self.count;
    ++self.count;
    self.items[key] = new Item(x);
  };
  self.sort = function(){
    self.items.sort(function(a,b) { return a.compareTo(b); });
  };
}
var m = new Model();
var sorter = null, view = null;
function newPair() {
  var n = m.count;
  if (n > 1) {
    var gain = 0;
    var a, b;
    for (var i = 0; i < n; ++i) {
      for (var j = i + 1; j < n; ++j) {
        var newGain = m.items[i].hist.and(m.items[j].hist).entropy();
        if (newGain > gain) {
          a = i;
          b = j;
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
  newPair();
  if (a || b) {
    a.precede(b);
    view.forceUpdate();
  }
}
view = React.renderComponent(MutableList( {items:m.items, add:addItem, sorter:m.sort}), $('#list')[0]);
sorter = React.renderComponent(Sorter( {learnOrder:learnOrder}), $('#sorter')[0]);
