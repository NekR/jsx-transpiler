var acorn = require('acorn-jsx');
var parse = acorn.parse;
var generate = require('escodegen').generate;
var attachComments = require('./estraverse-fb').attachComments;
var JSX = require('./JSX');

var jsxVisitor = new JSX();

module.exports = exports = {};

exports.parse = function (code, options) {
	options = options || {};

	var attachComment = options.attachComment;

	// emulating feature of esprima@1.2
	if (attachComment) {
		var comments = [];
		var oldOnComment = options.onComment;
		options.onComment = function (block, text, start, end) {
			oldOnComment && oldOnComment.apply(this, arguments);
			comments.push({
				type: block ? 'Block' : 'Line',
				value: text,
				range: [start, end]
			});
		};
		
		var tokens = [];
		var oldOnToken = options.onToken;
		options.onToken = function (token) {
			oldOnToken && oldOnToken.apply(this, arguments);
			if (token.type.type !== 'eof') {
				tokens.push({
					range: [token.start, token.end]
				});
			}
		};

		options.ranges = true;
	}

	var ast = parse(code, options);

	// emulating feature of esprima@1.2 using estraverse's method
	return attachComment ? attachComments(ast, comments, tokens) : ast;
};

exports.transform = jsxVisitor.visit.bind(jsxVisitor);

exports.generate = generate;

exports.compile = function (code, options) {
	options = options || {};

	if (options.attachComment === undefined) {
		options.attachComment = true;
	}

	options.sourceMapWithCode = true;

	var ast = exports.parse(code, options);
	ast = exports.transform(ast);

	if (options.attachComment) {
		options.comment = true;
	}

	return generate(ast, options);
};