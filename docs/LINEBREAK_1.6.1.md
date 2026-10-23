# Linebreak Optimizer 1.6.1

Crack's current unlabeled send button omits the HTML type attribute. Its DOM
type is nevertheless submit. Both keyboard guard paths now inspect button.type
instead of requiring an explicit [type="submit"] attribute.

Enter remains newline; Ctrl+Enter sends on Windows. Existing Apple-touch
Command+Enter behavior and IME handling are unchanged. Draft Keeper is unchanged.

Validation: node syntax and keyboard contract tests pass. Offline Chrome keyboard
test confirms Enter inserts a newline without sending, Ctrl+Enter clicks the
unlabeled/default-submit button exactly once, and a disabled button is not clicked.
No real chat message was sent; live site confirmation remains pending.
