import os
from pathlib import Path

from dotenv import load_dotenv
from openai import AzureOpenAI


PROJECT_DIR = Path(__file__).resolve().parent

load_dotenv(PROJECT_DIR / ".env")


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def read_secret_file(path_value: str) -> str:
    secret_path = Path(path_value).expanduser()
    if not secret_path.is_absolute():
        secret_path = PROJECT_DIR / secret_path

    content = secret_path.read_text(encoding="utf-8").strip()
    if "=" in content:
        content = content.split("=", 1)[1].strip()

    if not content:
        raise RuntimeError(f"Secret file is empty: {secret_path}")

    return content


def get_api_key() -> str:
    key_file = os.getenv("AZURE_OPENAI_API_KEY_FILE")
    if key_file:
        return read_secret_file(key_file)

    return require_env("AZURE_OPENAI_API_KEY")


client = AzureOpenAI(
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"),
    azure_endpoint=require_env("AZURE_OPENAI_ENDPOINT"),
    api_key=get_api_key(),
)

response = client.chat.completions.create(
    messages=[
        {
            "role": "system",
            "content": "You are a helpful assistant.",
        },
        {
            "role": "user",
            "content": "I am going to Paris, what should I see?",
        },
    ],
    max_completion_tokens=16384,
    model=os.getenv("AZURE_OPENAI_MODEL", "gpt-5.4"),
)

print(response.choices[0].message.content)
