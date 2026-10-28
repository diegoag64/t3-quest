#!/usr/bin/env python3
"""Configure hosted transcription without putting an API key in shell history."""
import getpass
import json
import os
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]

def main():
    print('Hosted speech recognition. The API key is saved only in this project’s ignored .env file.')
    provider = input('Provider: openrouter, wispr, openai, or custom [openrouter]: ').strip().lower() or 'openrouter'
    if provider not in ('openrouter', 'wispr', 'openai', 'custom'):
        raise ValueError('Choose openrouter, wispr, openai, or custom.')
    if provider == 'wispr':
        print('Wispr requires approved developer API access: https://api-docs.wisprflow.ai/quickstart')
        url = 'https://platform-api.wisprflow.ai/api/v1/dash/api'
    elif provider == 'openai':
        url = 'https://api.openai.com/v1/audio/transcriptions'
    elif provider == 'openrouter':
        url = 'https://openrouter.ai/api/v1/audio/transcriptions'
        print('Suggested models: microsoft/mai-transcribe-2, openai/whisper-large-v3-turbo, mistralai/voxtral-mini-transcribe')
    else:
        url = input('HTTPS endpoint accepting multipart file/model and returning JSON text: ').strip()
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Use an HTTPS endpoint without credentials, query, or fragment.')
    default_model = 'gpt-transcribe' if parsed.hostname == 'api.openai.com' else ''
    if provider == 'openrouter':
        default_model = 'microsoft/mai-transcribe-2'
    model = '' if provider == 'wispr' else (input(f'Model [{default_model}]: ').strip() or default_model)
    if (not model and provider != 'wispr') or len(model) > 200 or '\n' in model or '\r' in model:
        raise ValueError('Enter a model name supported by your provider.')
    key = getpass.getpass('API key (hidden): ').strip()
    if not key or '\n' in key or '\r' in key:
        raise ValueError('An API key is required.')
    values = {'TRANSCRIPTION_PROVIDER': provider, 'TRANSCRIPTION_URL': url, 'TRANSCRIPTION_MODEL': model, 'TRANSCRIPTION_KEY': key}
    path = ROOT / '.env'
    lines = path.read_text().splitlines() if path.exists() else []
    lines = [line for line in lines if line.partition('=')[0].strip() not in values]
    lines += [name + '=' + json.dumps(value) for name, value in values.items()]
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write('\n'.join(lines) + '\n')
    print('Saved. Restart the laptop bridge to enable the microphone button on Quest.')

if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyboardInterrupt, EOFError) as error:
        print(str(error) or 'Setup cancelled.')
        raise SystemExit(1)
