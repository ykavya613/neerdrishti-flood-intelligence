"""
Unit tests for Meta Llama OpenAI-compatible provider, active model configuration, and deterministic fallback.
"""

import os
import json
import unittest
from unittest.mock import patch, MagicMock

from src.config import (
    LLM_PROVIDER,
    OPENAI_COMPATIBLE_BASE_URL,
    OPENAI_COMPATIBLE_API_KEY,
    OPENAI_COMPATIBLE_MODEL,
    LIVE_DATA_REFRESH_MINUTES,
)
from src.ai_engine import AIEngine


class TestAIProviderLlama(unittest.TestCase):

    def setUp(self):
        self.sample_district = {
            "district": "Hyderabad",
            "flood_risk_score": 68.5,
            "risk_category": "HIGH",
            "rainfall_mm_24h": 85.0,
            "rainfall_mm_3h": 35.0,
            "rainfall_score": 75.0,
            "flood_history_score": 70.0,
            "location_risk_score": 60.0,
            "terrain_type": "Urban Lowland & Musi River Basin",
            "drainage_vulnerability_score": 75.0,
            "citizen_reports_count": 4,
            "citizen_reports_high_severity": 2,
            "river_basin": "Musi Sub-basin",
            "vulnerable_hotspots": "Moosarambagh, Begumpet Nala, Nadeem Colony",
        }

    def test_1_default_configuration_values(self):
        """Test 1: Verify default Meta Llama and Ollama environment configuration."""
        self.assertEqual(LLM_PROVIDER, "llama")
        self.assertEqual(OPENAI_COMPATIBLE_BASE_URL, "http://127.0.0.1:11434/v1")
        self.assertEqual(OPENAI_COMPATIBLE_API_KEY, "ollama")
        self.assertEqual(OPENAI_COMPATIBLE_MODEL, "llama3.2:3b")
        self.assertEqual(LIVE_DATA_REFRESH_MINUTES, 30)

    def test_2_ai_engine_initialization(self):
        """Test 2: AIEngine properly initializes with Meta Llama configuration without Gemini dependencies."""
        engine = AIEngine()
        self.assertEqual(engine.provider, "llama")
        self.assertEqual(engine.openai_model, "llama3.2:3b")
        self.assertEqual(engine.openai_base, "http://127.0.0.1:11434/v1")
        self.assertFalse(hasattr(engine, "gemini_key"))

    @patch("urllib.request.urlopen")
    def test_3_successful_llama_inference(self, mock_urlopen):
        """Test 3: Verify successful OpenAI-compatible Meta Llama inference and metadata labeling."""
        mock_cm = MagicMock()
        mock_cm.status = 200
        mock_body = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps({
                            "situation_summary": "Hyderabad is experiencing high flood risk due to intense precipitation.",
                            "main_risk_factors": ["85mm rain", "Musi overflow"],
                            "explanation_of_risk": "High score based on rainfall and terrain.",
                            "recommended_actions": ["Avoid low causeways"],
                            "english_advisory": "High flood alert for Hyderabad.",
                            "telugu_advisory": "హైదరాబాద్‌కు తీవ్ర వరద హెచ్చరిక.",
                            "evidence_used": ["85mm telemetry"],
                            "data_limitation_statement": "Prototype advisory."
                        })
                    }
                }
            ]
        }
        mock_cm.read.return_value = json.dumps(mock_body).encode("utf-8")
        mock_cm.__enter__.return_value = mock_cm
        mock_urlopen.return_value = mock_cm

        engine = AIEngine()
        result = engine.generate_district_reasoning(self.sample_district)

        self.assertFalse(result["fallback_used"])
        self.assertEqual(result["reasoning_source"], "Meta Llama")
        self.assertEqual(result["model_provider"], "Meta Llama")
        self.assertEqual(result["model_name"], "llama3.2:3b")
        self.assertIn("Hyderabad", result["situation_summary"])

    @patch("urllib.request.urlopen")
    def test_4_markdown_code_fence_stripping(self, mock_urlopen):
        """Test 4: Strip markdown ```json code blocks from Meta Llama output cleanly."""
        mock_cm = MagicMock()
        mock_cm.status = 200
        inner_json = json.dumps({
            "situation_summary": "Clean JSON extracted.",
            "main_risk_factors": [],
            "explanation_of_risk": "Testing fence strip.",
            "recommended_actions": [],
            "english_advisory": "Advisory text.",
            "telugu_advisory": "సలహా.",
            "evidence_used": [],
            "data_limitation_statement": "Prototype."
        })
        mock_body = {
            "choices": [
                {
                    "message": {
                        "content": f"```json\n{inner_json}\n```"
                    }
                }
            ]
        }
        mock_cm.read.return_value = json.dumps(mock_body).encode("utf-8")
        mock_cm.__enter__.return_value = mock_cm
        mock_urlopen.return_value = mock_cm

        engine = AIEngine()
        result = engine.generate_district_reasoning(self.sample_district)
        self.assertEqual(result["situation_summary"], "Clean JSON extracted.")
        self.assertEqual(result["reasoning_source"], "Meta Llama")

    @patch("urllib.request.urlopen")
    def test_5_deterministic_fallback_when_llama_offline(self, mock_urlopen):
        """Test 5: Gracefully fall back to deterministic mathematical engine when Ollama is offline."""
        mock_urlopen.side_effect = Exception("Connection refused to http://127.0.0.1:11434/v1")

        engine = AIEngine()
        result = engine.generate_district_reasoning(self.sample_district)

        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["reasoning_source"], "Deterministic Fallback")
        self.assertEqual(result["model_provider"], "Deterministic Risk Engine")
        self.assertEqual(result["model_name"], "Rule-Based Fallback")
        self.assertIn("Hyderabad", result["situation_summary"])
        self.assertIn("68.5/100", result["situation_summary"])
        self.assertIn("వరద హెచ్చరిక", result["telugu_advisory"])
        self.assertIn("Deterministic flood risk engine fallback", result["data_limitation_statement"])


if __name__ == "__main__":
    unittest.main()
