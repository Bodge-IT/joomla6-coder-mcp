export async function runFix(
  _input: { filePath?: string; code?: string; standard?: string }
): Promise<string> {
  return [
    '## PHP Fix (phpcbf)',
    '',
    'PHP is not currently installed on this server.',
    'When PHP and phpcbf are available, this tool will:',
    '- Auto-fix coding standard violations',
    '- Return the corrected code',
    '- Support Joomla coding standards',
    '',
    'To enable: install PHP 8.2+ and phpcs/phpcbf, then restart the service.',
  ].join('\n');
}
