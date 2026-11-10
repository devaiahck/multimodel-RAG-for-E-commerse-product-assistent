"""
Multimodal Encoder Module using Hugging Face Transformers.
Supports joint vision-language embeddings using SigLIP (or CLIP).
"""

import io
import logging
import threading
from typing import List, Optional

import torch
from cachetools import TTLCache
from PIL import Image
from transformers import AutoProcessor, AutoModel

logger = logging.getLogger(__name__)

DEFAULT_MODEL_NAME = "google/siglip-base-patch16-224"
FALLBACK_MODEL_NAME = "openai/clip-vit-base-patch32"


class MultimodalEncoder:
    """
    Multimodal encoder for generating normalized visual and textual embeddings.
    """

    def __init__(
        self,
        model_name: str = DEFAULT_MODEL_NAME,
        device: Optional[str] = None,
        cache_maxsize: int = 512,
        cache_ttl: int = 3600,
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model_name = model_name
        self.model = None
        self.processor = None
        # Thread-safe LRU+TTL cache for text embeddings only.
        self._text_cache: TTLCache = TTLCache(maxsize=cache_maxsize, ttl=cache_ttl)
        self._cache_lock = threading.Lock()
        self._load_model()

    def _load_model(self) -> None:
        """Loads processor and model from Hugging Face, with fallback support."""
        for candidate in (self.model_name, FALLBACK_MODEL_NAME):
            for local_only in (True, False):
                try:
                    logger.info(
                        "Loading multimodal model '%s' on device '%s' (local_files_only=%s)...",
                        candidate,
                        self.device,
                        local_only,
                    )
                    self.processor = AutoProcessor.from_pretrained(
                        candidate, local_files_only=local_only
                    )
                    self.model = AutoModel.from_pretrained(
                        candidate, local_files_only=local_only
                    ).to(self.device)
                    self.model.eval()
                    self.model_name = candidate
                    logger.info("Successfully loaded model '%s'.", candidate)
                    return
                except Exception as err:
                    if local_only:
                        continue
                    logger.warning(
                        "Failed to load '%s' with remote check: %s.", candidate, err
                    )
        raise RuntimeError("Could not initialize MultimodalEncoder with any model candidate.")

    def encode_text(self, text: str) -> List[float]:
        """
        Encodes input text string into a normalized embedding vector.

        Results are cached in an LRU+TTL cache keyed by the normalized query
        string, so repeated identical queries skip the model entirely.

        :param text: Input string prompt, product title, or query.
        :return: Normalized vector representation as a list of floats.
        """
        if not text or not text.strip():
            raise ValueError("Input text cannot be empty.")

        cache_key = text.strip()
        with self._cache_lock:
            cached = self._text_cache.get(cache_key)
        if cached is not None:
            return cached

        with torch.no_grad():
            inputs = self.processor(text=[cache_key], return_tensors="pt", padding=True, truncation=True)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            outputs = self.model.get_text_features(**inputs)

            if isinstance(outputs, torch.Tensor):
                tensor = outputs
            elif hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                tensor = outputs.pooler_output
            elif hasattr(outputs, "last_hidden_state"):
                tensor = outputs.last_hidden_state[:, 0, :]
            else:
                tensor = outputs[0]

            # L2 normalize
            tensor = tensor / tensor.norm(p=2, dim=-1, keepdim=True)
            embedding = tensor.squeeze(0).cpu().numpy().tolist()

        with self._cache_lock:
            self._text_cache[cache_key] = embedding
        return embedding

    def encode_image(self, image_bytes: bytes) -> List[float]:
        """
        Encodes input image raw bytes into a normalized embedding vector.

        :param image_bytes: Raw bytes of the image file (JPG, PNG, WebP, etc.).
        :return: Normalized vector representation as a list of floats.
        """
        if not image_bytes:
            raise ValueError("Image bytes cannot be empty.")

        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as e:
            logger.error(f"Failed to decode image bytes: {e}")
            raise ValueError(f"Invalid image format or corrupted bytes: {e}") from e

        with torch.no_grad():
            inputs = self.processor(images=image, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            outputs = self.model.get_image_features(**inputs)

            if isinstance(outputs, torch.Tensor):
                tensor = outputs
            elif hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                tensor = outputs.pooler_output
            elif hasattr(outputs, "last_hidden_state"):
                tensor = outputs.last_hidden_state[:, 0, :]
            else:
                tensor = outputs[0]

            # L2 normalize
            tensor = tensor / tensor.norm(p=2, dim=-1, keepdim=True)
            embedding = tensor.squeeze(0).cpu().numpy().tolist()
            return embedding
