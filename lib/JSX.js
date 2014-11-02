var types = require('ast-types');
var traverse = require('./estraverse-fb').replace;
var b = types.builders;
var jsxAnnotationRegexp = /^\*\s*@jsx\s+([^\s]+)/;
var jsxComponentsAnnotationRegexp = /^\*\s*@components\s+([^\s]+)/;
var knownTags = require('./knownTags');
var isIdentifierName = require('esutils').keyword.isIdentifierName;

var DEFAULT_DOM_HEADER = 'React.DOM';
var DEFAULT_COMPONENT_HEADER = '';

function JSX(headers) {
  this.domHeader = headers && headers.dom || DEFAULT_DOM_HEADER;
  this.componentsHeader = headers && headers.components || DEFAULT_COMPONENT_HEADER;

  this.jsx = null;
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
    var jsx = this.domHeader;
    var components = this.componentsHeader;

    // looking for namespace annotation
    (node.leadingComments || []).some(function (comment) {
      var matches = jsxAnnotationRegexp.exec(comment.value);

      if (matches) {
        jsx = matches[1];
        return true;
      } else {
        return false;
      }
    });

    (node.leadingComments || []).some(function (comment) {
      var matches = jsxComponentsAnnotationRegexp.exec(comment.value);

      if (matches) {
        components = matches[1];
        return true;
      } else {
        return false;
      }
    });

    // prebuilding AST node
    this.jsx =
      jsx.split('.')
      .map(b.identifier)
      .reduce(function (object, property) {
        return b.memberExpression(object, property, false);
      });

    this.components =
      components ? components.split('.')
        .map(b.identifier)
        .reduce(function (object, property) {
          return b.memberExpression(object, property, false);
        }) : null;
  },

  enterXJSIdentifier: function (node) {
    if (isIdentifierName(node.name)) {
      node.type = 'Identifier';
    } else {
      return b.literal(node.name);
    }
  },

  enterXJSNamespacedName: function () {
    throw new Error('Namespace tags are not supported. ReactJSX is not XML.');
  },

  leaveXJSMemberExpression: function (node) {
    node.type = 'MemberExpression';
    node.computed = node.property.type === 'Literal';
  },

  /*enterXJSEmptyExpression: function (node) {
    node.type = 'Literal';
    node.value = null;
  },*/

  leaveXJSEmptyExpression: function (node) {
    node.type = 'Literal';
    node.value = null;
  },
`
  enterXJSExpressionContainer: function (node) {
    return node.expression;
  },

  leaveXJSAttribute: function (node) {
    var propNode = b.property('init', node.name, node.value) || b.literal(true));
    propNode.loc = node.loc;
    return propNode;
  },

  leaveXJSOpeningElement: function (node) {
    var tagExpr = node.name,
      props = node.attributes;

    if (knownTags[tagExpr.name]) {
      tagExpr = b.memberExpression(this.jsx, tagExpr, false);
    } else if (this.components) {
      tagExpr = b.memberExpression(this.components, tagExpr, false);
    }

    return b.callExpression(tagExpr, [props.length ? b.objectExpression(props) : b.literal(null)]);
  },

  leaveXJSElement: function (node) {
    var callExpr = node.openingElement,
      args = callExpr.arguments,
      children = node.children;

    if (children.length) {
      args.push(b.arrayExpression(children));
    }

    callExpr.loc = node.loc;
    return callExpr;
  }
};

// precompiling enter+leave methods from found enter*/leave* handlers, additionally patching with original location info
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