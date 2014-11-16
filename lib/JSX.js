var types = require('ast-types');
var traverse = require('./estraverse-fb').replace;
var b = types.builders;
var isIdentifierName = require('esutils').keyword.isIdentifierName;

var DEFAULT_TAG_CALL = 'JSX.tag';

function JSX(headers) {
  this.tagCall = null;
}

JSX.prototype = {
  visit: function (ast) {
    var enter = this.enter.bind(this);
    var leave = this.leave.bind(this);

    return traverse(ast, {
      enter: function(a) {
        return enter.apply(null, arguments);
      },
      leave: function(a) {
        return leave.apply(null, arguments);
      }
    });
  },

  enterProgram: function (node) {
    var tags = DEFAULT_TAG_CALL;

    // prebuilding AST node
    this.tagCall =
      tags.split('.')
      .map(b.identifier)
      .reduce(function (object, property) {
        return b.memberExpression(object, property, false);
      });
  },

  enterXJSIdentifier: function (node) {
    if (isIdentifierName(node.name)) {
      node.type = 'Identifier';
    } else {
      var isNameSpaced = node.name.indexOf(':') !== -1;

      node = b.literal(node.name);
      node.namespaced = isNameSpaced;
    }
  },

  enterXJSNamespacedName: function (node) {
    node = b.identifier(node.namespace.name + ':' + node.name.name);
    node.namespaced = true;

    return node;
  },

  leaveXJSMemberExpression: function (node) {
    node = b.identifier(node.object.name + ':' + node.property.name);
    node.namespaced = true;

    return node;
  },

  /*enterXJSEmptyExpression: function (node) {
    node.type = 'Literal';
    node.value = null;
  },*/

  leaveXJSEmptyExpression: function (node) {
    node.type = 'Literal';
    node.value = null;
  },

  enterXJSExpressionContainer: function (node) {
    return node.expression;
  },

  leaveXJSAttribute: function (node) {
    var propName = node.name;

    if (!isIdentifierName(propName.name)) {
      propName = b.literal(propName.name);
    }

    var propNode = b.property('init', propName, node.value || b.literal(true));
    propNode.loc = node.loc;
    return propNode;
  },

  leaveXJSOpeningElement: function (node) {
    var tagExpr = node.name,
      props = node.attributes,
      namespaces = Object.create(null);

    (function() {
      for (var i = 0, len = props.length; i < len; i++) {
        var prop = props[i];
        var key = prop.key.value || prop.key.name;
        var namespaced = key.indexOf(':');

        if (namespaced === -1) {
          namespaced = key.indexOf('-');
        }

        if (namespaced !== -1) {
          var ns = key.slice(0, namespaced);
          var name = key.slice(namespaced + 1);
        } else {
          var name = key;
          var ns = '#default';
        }

        if (!namespaces[ns]) {
          namespaces[ns] = [];
        }

        prop.key = isIdentifierName(name) ? b.identifier(name) : b.literal(name);
        namespaces[ns].push(prop);
      }
    }());

    props = Object.keys(namespaces).map(function(ns) {
      var propName = ns;

      if (isIdentifierName(propName)) {
        propName = b.identifier(propName);
      } else {
        propName = b.literal(propName);
      }

      var object = b.objectExpression(namespaces[ns]);
      var prop = b.property('init', propName, object);

      return prop;
    });

    return b.callExpression(this.tagCall, [
      b.literal(tagExpr.name),
      props.length ? b.objectExpression(props) : b.literal(null)
    ]);
  },

  leaveXJSElement: function (node) {
    var callExpr = node.openingElement,
      args = callExpr.arguments,
      children = node.children;

    if (children.length) {
      this.trimChildren(children, 'start');
    }

    if (children.length) {
      this.trimChildren(children, 'end');
    }

    if (children.length) {
      args.push(b.arrayExpression(children));
    }

    callExpr.loc = node.loc;
    return callExpr;
  },
  trimChildren: function(children, position) {
    var start = position === 'start';
    var end = position === 'end';

    if (!start && !end) throw new TypeError('Bad argument');

    var child = children[start ? 0 : children.length - 1];
    var trimType = start ? 'trimLeft' : 'trimRight';

    if (child.type === 'Literal') {
      var value = child.value.trim();

      if (value) {
        child.value = child.value[trimType]();
        child.raw = child.raw[trimType]();
      } else {
        if (children.length !== 2) {
          children[start ? 'shift' : 'pop']();
        } else {
          child.raw = child.value = '';
        }
      }
    }
  }
};

// precompiling enter+leave methods from found enter*/leave* handlers,
// additionally patching with original location info
['enter', 'leave'].forEach(function (handlerType) {
  var lines =
    Object.keys(this)
    .filter(function (methodName) { return methodName.slice(0, handlerType.length) === handlerType })
    .map(function (methodName) {
      var nodeType = methodName.slice(handlerType.length);
      return 'case "' + nodeType + '": return this.' + methodName + '(node); break;';
    });

  lines.unshift('switch (node.type) {');
  lines.push('}');

  this[handlerType] = new Function('node', lines.join('\n'));
}, JSX.prototype);

module.exports = JSX;