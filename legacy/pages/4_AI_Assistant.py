"""
NeerDrishti - AI Flood Intelligence Assistant
"""

import streamlit as st
from src.data_processor import DataProcessor
from src.ai_engine import AIEngine, load_knowledge_base_doc

st.set_page_config(page_title="AI Flood Assistant | NeerDrishti", page_icon="🤖", layout="wide")

st.title("🤖 AI Flood Intelligence Assistant")
st.caption("Grounded Conversational Intelligence & Hydrological Retrieval (English & తెలుగు)")

dp = DataProcessor()
ai = AIEngine()

# Sidebar context
st.sidebar.header("📚 Context Grounding")
st.sidebar.markdown("""
This assistant reasons directly over:
1. **Mathematical Risk Engine Outputs** (0–100 normalized scores)
2. **Current Rainfall & Stream Gauges**
3. **Crowdsourced Citizen Telemetry**
4. **Telangana District Markdown Knowledge Base**
""")

# Chat History
if "messages" not in st.session_state:
    st.session_state.messages = [
        {
            "role": "assistant",
            "content": "Namaskaram! I am the **NeerDrishti AI Flood Intelligence Assistant**. You can ask me about current flood risks, drainage bottlenecks, rainfall metrics, or evacuation guidance across **Hyderabad, Warangal, Nirmal, Mancherial, and Bhadradri Kothagudem**."
        }
    ]

# Display history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# User prompt
if prompt := st.chat_input("e.g., What is the flood risk situation in Hyderabad? / భద్రాద్రి కొత్తగూడెం వరద పరిస్థితి ఏమిటి?"):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.spinner("Analyzing district signals and retrieving hydrological context..."):
            # Detect target district if mentioned
            all_status = dp.get_district_status_list()
            matched_district = None
            for d in all_status:
                if d["district"].lower() in prompt.lower():
                    matched_district = d
                    break
            
            if not matched_district:
                # Default to highest risk district if not specified
                matched_district = max(all_status, key=lambda x: x["flood_risk_score"])
                note = f"*(Note: District not explicitly specified; reasoning focused on highest-risk district: **{matched_district['district']}**)*\n\n"
            else:
                note = ""

            reasoning = ai.generate_district_reasoning(matched_district)
            
            response_text = f"""{note}### 🌊 Situation Assessment for {matched_district['district']}
**Current Risk Level:** `{matched_district['flood_risk_score']}/100` ({matched_district['risk_category']})
**24h Rainfall Telemetry:** `{matched_district['rainfall_mm_24h']} mm` | **Active Citizen Reports:** `{matched_district['citizen_reports_count']}`

#### 🔍 AI Reasoning & Contributing Factors
{reasoning.get('explanation_of_risk', '')}

**Primary Drivers:**
"""
            for factor in reasoning.get("main_risk_factors", []):
                response_text += f"\n- {factor}"

            response_text += f"""

---
#### 🇬🇧 Public Safety Action Plan
"""
            for action in reasoning.get("recommended_actions", []):
                response_text += f"\n- {action}"

            response_text += f"""

---
#### 🇮🇳 తెలుగు హెచ్చరిక (Telugu Advisory)
> *{reasoning.get('telugu_advisory', '')}*

---
<small style="color: #64748b;">⚠️ <b>Data Limitation Notice:</b> {reasoning.get('data_limitation_statement', '')}</small>
"""
            st.markdown(response_text, unsafe_allow_html=True)
            st.session_state.messages.append({"role": "assistant", "content": response_text})
