"""
Notification provider implementations.
Supports:
- ConsoleProvider: logs to logger and appends to backend/data/sent_notifications.log
- TelegramProvider: sends message via Telegram Bot API
- SmsProvider: stub for future SMS integrations (MSG91/Twilio)
"""

import abc
import datetime
import logging
from pathlib import Path
from typing import Optional
import httpx

from config import settings

logger = logging.getLogger("notifications")

LOGS_DIR = Path(__file__).resolve().parent.parent / "data"
LOG_FILE_PATH = LOGS_DIR / "sent_notifications.log"


class BaseNotificationProvider(abc.ABC):
    @abc.abstractmethod
    async def send(self, destination: str, message: str) -> bool:
        """Send a notification message to the destination."""
        pass


class ConsoleProvider(BaseNotificationProvider):
    def __init__(self, log_path: Path = LOG_FILE_PATH):
        self.log_path = log_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    async def send(self, destination: str, message: str) -> bool:
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        log_line = f"[{now_iso}] TO: {destination} | MSG: {message}\n"
        
        logger.info(f"[ConsoleNotification] To: {destination} - {message}")
        
        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(log_line)
            return True
        except Exception as e:
            logger.error(f"Failed to write to sent_notifications.log: {e}")
            return False


class TelegramProvider(BaseNotificationProvider):
    def __init__(self, bot_token: Optional[str] = None):
        self.bot_token = bot_token or settings.TELEGRAM_BOT_TOKEN
        if not self.bot_token:
            logger.warning("TelegramProvider initialized without TELEGRAM_BOT_TOKEN")

    async def send(self, destination: str, message: str) -> bool:
        if not self.bot_token:
            logger.error("Cannot send telegram notification: TELEGRAM_BOT_TOKEN is missing")
            return False

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": destination,
            "text": message,
            "parse_mode": "HTML",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    logger.info(f"Telegram notification sent to {destination}")
                    return True
                else:
                    logger.error(f"Telegram send failed ({resp.status_code}): {resp.text}")
                    return False
        except Exception as e:
            logger.error(f"Telegram request failed: {e}")
            return False


class SmsProvider(BaseNotificationProvider):
    async def send(self, destination: str, message: str) -> bool:
        raise NotImplementedError(
            "SMS provider is a stub. Configure MSG91 or Twilio for live SMS delivery."
        )


def get_notification_provider(provider_type: Optional[str] = None) -> BaseNotificationProvider:
    choice = (provider_type or settings.NOTIFY_PROVIDER or "console").strip().lower()
    if choice == "console":
        return ConsoleProvider()
    elif choice == "telegram":
        return TelegramProvider()
    elif choice == "sms":
        return SmsProvider()
    else:
        logger.warning(f"Unknown notification provider '{choice}', falling back to console.")
        return ConsoleProvider()

