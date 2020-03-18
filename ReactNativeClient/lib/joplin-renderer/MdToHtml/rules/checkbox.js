let checkboxIndex_ = -1;

const checkboxStyles = [];

checkboxStyles[1] = `
	/* Remove the indentation from the checkboxes at the root of the document
	   (otherwise they are too far right), but keep it for their children to allow
	   nested lists. Make sure this value matches the UL margin. */

	.md-checkbox .checkbox-wrapper {
		display: flex;
		align-items: center;
	}

	li.md-checkbox {
		list-style-type: none;
	}

	li.md-checkbox input[type=checkbox] {
		margin-left: -1.71em;
		margin-right: 0.7em;
	}
`;

checkboxStyles[2] = '';

function createPrefixTokens(Token, id, checked, label, postMessageSyntax, sourceToken) {
	let token = null;
	const tokens = [];

	// A bit hard to handle errors here and it's unlikely that the token won't have a valid
	// map parameter, but if it does set it to a very high value, which will be more easy to notice
	// in calling code.
	const lineIndex = sourceToken.map && sourceToken.map.length ? sourceToken.map[0] : 99999999;
	const checkedString = checked ? 'checked' : 'unchecked';

	const labelId = `cb-label-${id}`;

	const js = `
		try {
			if (this.checked) {
				this.setAttribute('checked', 'checked');
			} else {
				this.removeAttribute('checked');
			}

			${postMessageSyntax}('checkboxclick:${checkedString}:${lineIndex}');
			const label = document.getElementById("${labelId}");
			label.classList.remove(this.checked ? 'checkbox-label-unchecked' : 'checkbox-label-checked');
			label.classList.add(this.checked ? 'checkbox-label-checked' : 'checkbox-label-unchecked');
		} catch (error) {
			console.warn('Checkbox ${checkedString}:${lineIndex} error', error);
		}
		return true;
	`;

	token = new Token('checkbox_wrapper_open', 'div', 1);
	token.attrs = [['class', 'checkbox-wrapper']];
	tokens.push(token);

	token = new Token('checkbox_input', 'input', 0);
	token.attrs = [['type', 'checkbox'], ['id', id], ['onclick', js]];
	if (checked) token.attrs.push(['checked', 'checked']);
	tokens.push(token);

	token = new Token('label_open', 'label', 1);
	token.attrs = [['id', labelId], ['for', id], ['class', `checkbox-label-${checkedString}`]];
	tokens.push(token);

	if (label) {
		token = new Token('text', '', 0);
		token.content = label;
		tokens.push(token);
	}

	return tokens;
}

function createSuffixTokens(Token) {
	return [
		new Token('label_close', 'label', -1),
		new Token('checkbox_wrapper_close', 'div', -1),
	];
}

function installRule(markdownIt, mdOptions, ruleOptions, context) {
	const pluginOptions = { renderingType: 1, ...ruleOptions.plugins['checkbox'] };

	markdownIt.core.ruler.push('checkbox', state => {
		const tokens = state.tokens;
		const Token = state.Token;

		const checkboxPattern = /^\[([x|X| ])\] (.*)$/;
		let currentListItem = null;
		let processedFirstInline = false;
		const lists = [];
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];

			if (token.type === 'bullet_list_open') {
				lists.push(token);
				continue;
			}

			if (token.type === 'bullet_list_close') {
				lists.pop();
				continue;
			}

			if (token.type === 'list_item_open') {
				currentListItem = token;
				processedFirstInline = false;
				continue;
			}

			if (token.type === 'list_item_close') {
				currentListItem = null;
				processedFirstInline = false;
				continue;
			}

			// Note that we only support list items that start with "-" (not with "*")
			if (currentListItem && currentListItem.markup === '-' && !processedFirstInline && token.type === 'inline') {
				processedFirstInline = true;
				const firstChild = token.children && token.children.length ? token.children[0] : null;
				if (!firstChild) continue;

				const matches = checkboxPattern.exec(firstChild.content);
				if (!matches || matches.length < 2) continue;

				const checked = matches[1] !== ' ';
				const label = matches.length >= 3 ? matches[2] : '';

				const currentList = lists[lists.length - 1];

				if (pluginOptions.renderingType === 1) {
					checkboxIndex_++;
					const id = `md-checkbox-${checkboxIndex_}`;

					// Prepend the text content with the checkbox markup and the opening <label> tag
					// then append the </label> tag at the end of the text content.

					const prefix = createPrefixTokens(Token, id, checked, label, ruleOptions.postMessageSyntax, token);
					const suffix = createSuffixTokens(Token);

					token.children = markdownIt.utils.arrayReplaceAt(token.children, 0, prefix);
					token.children = token.children.concat(suffix);

					// Add a class to the <li> container so that it can be targetted with CSS.

					let itemClass = currentListItem.attrGet('class');
					if (!itemClass) itemClass = '';
					itemClass += ' md-checkbox joplin-checkbox';
					currentListItem.attrSet('class', itemClass.trim());
				} else {
					const textToken = new Token('text', '', 0);
					textToken.content = label;
					const tokens = [];
					tokens.push(textToken);

					token.children = markdownIt.utils.arrayReplaceAt(token.children, 0, tokens);

					const listClass = currentList.attrGet('class') || '';
					if (listClass.indexOf('joplin-') < 0) currentList.attrSet('class', (`${listClass} joplin-checklist`).trim());

					if (checked) {
						currentListItem.attrSet('class', (`${currentListItem.attrGet('class') || ''} checked`).trim());
					}
				}

				if (!('checkbox' in context.pluginAssets)) {
					context.pluginAssets['checkbox'] = [
						{
							inline: true,
							text: checkboxStyles[pluginOptions.renderingType],
							mime: 'text/css',
						},
					];
				}
			}
		}
	});
}

module.exports = function(context, ruleOptions) {
	return function(md, mdOptions) {
		installRule(md, mdOptions, ruleOptions, context);
	};
};
