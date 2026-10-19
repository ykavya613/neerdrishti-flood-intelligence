"""
NeerDrishti - Citizen Flood Reporting & AI Triage
"""

import streamlit as st
from datetime import datetime

from src.config import MONITORED_DISTRICTS
from src.database import add_citizen_report, get_all_reports, init_database
from src.report_processor import rule_based_fallback_triage

st.set_page_config(page_title="Citizen Reports | NeerDrishti", page_icon="📢", layout="wide")

init_database()

st.title("📢 Citizen Flood Hazard Reporting")
st.caption("Crowdsourced Ground Intelligence with Automated NLP Priority Triage")

col_form, col_list = st.columns([1, 1])

with col_form:
    st.subheader("📝 Submit New Flood Incident Report")
    
    with st.form("citizen_report_form", clear_on_submit=True):
        district = st.selectbox("Select District *", MONITORED_DISTRICTS)
        location = st.text_input("Specific Landmark / Street / Colony *", placeholder="e.g., Nadeem Colony Road No. 4, Tolichowki")
        severity = st.select_slider(
            "Observed Flood Severity *",
            options=["Low", "Moderate", "High", "Critical"],
            value="Moderate"
        )
        description = st.text_area(
            "Detailed Situation Description *",
            placeholder="Describe water depth (ankle, knee, waist), whether vehicles are submerged, nala blockage, elderly persons stranded, etc.",
            height=130
        )
        image_upload = st.file_uploader("Optional Photo Evidence (JPG/PNG)", type=["jpg", "jpeg", "png"])
        
        submitted = st.form_submit_button("🚨 Submit Incident Report", type="primary")
        
        if submitted:
            if not location or not description:
                st.error("Please provide both a specific location and a description.")
            else:
                # Run automated NLP Triage
                triage = rule_based_fallback_triage(description, severity)
                
                # Save into SQLite
                report_id = add_citizen_report(
                    district=district,
                    location=location,
                    severity=severity,
                    description=description,
                    ai_category=triage["ai_category"],
                    ai_severity=triage["ai_severity"],
                    priority=triage["priority"],
                )
                
                st.success(f"✅ Report #{report_id} successfully logged and triaged into NeerDrishti intelligence stream!")
                
                st.markdown("#### 🤖 Instant AI Triage Output")
                st.json({
                    "Assigned Category": triage["ai_category"],
                    "AI Assessed Severity": triage["ai_severity"],
                    "Dispatch Priority": triage["priority"],
                    "Status": "Dynamic score recalculated for " + district
                })

with col_list:
    st.subheader("📋 Verified Recent Ground Reports")
    filter_dist = st.selectbox("Filter by District:", ["All Districts"] + MONITORED_DISTRICTS)
    
    reports = get_all_reports(
        limit=20,
        district=filter_dist if filter_dist != "All Districts" else None
    )
    
    if not reports:
        st.info("No citizen reports found for the selected filter.")
    else:
        for rep in reports:
            priority_color = {
                "Emergency Dispatch": "red",
                "Immediate Review": "orange",
                "Elevated Action": "blue",
                "Standard Review": "green",
            }.get(rep["priority"], "gray")
            
            with st.container():
                st.markdown(f"**Report #{rep['id']} — {rep['district']} ({rep['location']})**")
                st.caption(f"🕒 {rep['reported_at']} | Priority: :{priority_color}[{rep['priority']}] | Category: **{rep['ai_category']}**")
                st.write(f"> *\"{rep['description']}\"*")
                st.markdown("---")
