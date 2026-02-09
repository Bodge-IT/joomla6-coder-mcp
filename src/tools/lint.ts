export async function runLint(
  _input: { filePath?: string; code?: string; standard?: string }
): Promise<string> {
  return [
    '## PHP Lint (phpcs)',
    '',
    'PHP is not currently installed on the server.',
    'When PHP and phpcs are available, this tool will:',
    '- Run PHP_CodeSniffer against the provided code or file',
    '- Report coding standard violations',
    '- Support Joomla coding standards',
    '',
    'To enable: install PHP 8.2+ and phpcs on the server, then restart the service.',
  ].join('\n');
}
