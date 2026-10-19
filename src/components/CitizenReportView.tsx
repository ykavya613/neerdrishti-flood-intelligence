import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Send, 
  CheckCircle2, 
  Filter, 
  MapPin, 
  Clock, 
  ShieldAlert, 
  Sparkles,
  Camera,
  FileText,
  Building,
  Car,
  Waves,
  Droplets,
  Layers,
  ChevronDown,
  Info,
  Check,
  X,
  RefreshCw,
  Eye,
  Tag,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { 
  CitizenReport, 
  IncidentType, 
  ReportSeverity, 
  ReportStatus, 
  ReportPriority 
} from '../types';

interface CitizenReportViewProps {
  districts: string[];
  onReportSubmitted: () => void;
}

export const CitizenReportView: React.FC<CitizenReportViewProps> = ({
  districts,
  onReportSubmitted,
}) => {
  // Navigation tabs: "Submit Report" vs "Demo Review Panel"
  const [activeTab, setActiveTab] = useState<'submit' | 'review'>('submit');

  // Reports state
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [totalReportsCount, setTotalReportsCount] = useState<number>(0);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(false);

  // Review panel filters
  const [filterDistrict, setFilterDistrict] = useState<string>('All');
  const [filterSeverity, setFilterSeverity] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');

  // Form State
  const [district, setDistrict] = useState<string>(districts[0] || 'Hyderabad');
  const [locationDescription, setLocationDescription] = useState<string>('');
  const [incidentType, setIncidentType] = useState<IncidentType>('Road Flooding');
  const [severity, setSeverity] = useState<ReportSeverity>('Moderate');
  const [description, setDescription] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    report: CitizenReport;
    classification: any;
    classification_source: string;
    updated_district?: any;
  } | null>(null);

  // Status updating state
  const [updatingReportId, setUpdatingReportId] = useState<number | null>(null);

  // Fetch Reports with filters
  const fetchReports = async () => {
    setIsLoadingReports(true);
    try {
      const params = new URLSearchParams();
      if (filterDistrict !== 'All') params.append('district', filterDistrict);
      if (filterSeverity !== 'All') params.append('severity', filterSeverity);
      if (filterStatus !== 'All') params.append('status', filterStatus);
      params.append('limit', '50');

      const res = await fetch(`/api/reports?${params.toString()}`);
      const data = await res.json();
      setReports(data.reports || []);
      setTotalReportsCount(data.total || (data.reports ? data.reports.length : 0));
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setIsLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filterDistrict, filterSeverity, filterStatus]);

  // Handle Image Selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setValidationError('Supported image formats: JPEG, PNG, WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setValidationError('Image size must be under 5 MB.');
      return;
    }

    setValidationError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!district) {
      setValidationError('District selection is required.');
      return;
    }

    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setValidationError('Description is required.');
      return;
    }

    if (trimmedDesc.length < 10) {
      setValidationError('Description must be at least 10 characters long to provide meaningful hazard context.');
      return;
    }

    if (trimmedDesc.length > 1000) {
      setValidationError('Description cannot exceed 1000 characters.');
      return;
    }

    if (locationDescription.length > 200) {
      setValidationError('Location description cannot exceed 200 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district,
          location_description: locationDescription.trim(),
          incident_type: incidentType,
          severity,
          description: trimmedDesc,
          image_reference: imagePreview,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setValidationError(data.error || 'Failed to submit report.');
        return;
      }

      if (data.success && data.report) {
        setSubmissionSuccess({
          report: data.report,
          classification: data.classification,
          classification_source: data.classification_source,
          updated_district: data.updated_district,
        });

        // Reset form
        setLocationDescription('');
        setDescription('');
        setImagePreview(null);
        setSeverity('Moderate');
        setIncidentType('Road Flooding');

        fetchReports();
        onReportSubmitted();
      }
    } catch (err: any) {
      console.error('Submission failed:', err);
      setValidationError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Status in Review Panel
  const handleStatusChange = async (reportId: number, newStatus: ReportStatus) => {
    setUpdatingReportId(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchReports();
        onReportSubmitted();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingReportId(null);
    }
  };

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'Immediate Review':
      case 'Emergency Dispatch':
        return <span className="px-2.5 py-1 rounded-md bg-red-100 text-red-800 font-bold text-xs border border-red-200 inline-flex items-center gap-1">🚨 Immediate Review</span>;
      case 'High Priority':
      case 'Elevated Action':
        return <span className="px-2.5 py-1 rounded-md bg-orange-100 text-orange-800 font-bold text-xs border border-orange-200 inline-flex items-center gap-1">⚠️ High Priority</span>;
      case 'Review':
        return <span className="px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 font-semibold text-xs border border-blue-200 inline-flex items-center gap-1">🔍 Review</span>;
      default:
        return <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium text-xs border border-slate-200 inline-flex items-center gap-1">👁️ Monitor</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'New':
        return <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-[11px] border border-blue-200">New</span>;
      case 'Reviewed':
        return <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200">Reviewed</span>;
      case 'Validated':
        return <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">Validated</span>;
      case 'Resolved':
        return <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[11px] border border-slate-300">Resolved</span>;
      case 'Rejected':
        return <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-200">Rejected</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">{status}</span>;
    }
  };

  const getIncidentIcon = (type: string) => {
    switch (type) {
      case 'River Overflow': return <Waves className="w-4 h-4 text-cyan-600" />;
      case 'Water Entering Buildings': return <Building className="w-4 h-4 text-purple-600" />;
      case 'Road Flooding': return <Car className="w-4 h-4 text-amber-600" />;
      case 'Drainage Overflow': return <Droplets className="w-4 h-4 text-blue-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Tab Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-blue-600" />
            <span>Citizen Flood Intelligence & Field Triage</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Persistent SQLite database with Meta Llama NLP classification, validated rule-based fallback, and deterministic score updates.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
          <button
            id="tab-submit-report"
            onClick={() => setActiveTab('submit')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'submit'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Submit Incident Report
          </button>
          <button
            id="tab-review-panel"
            onClick={() => setActiveTab('review')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'review'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Demo Review Panel</span>
            <span className="ml-1 px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded-full text-[10px] font-mono">
              {totalReportsCount}
            </span>
          </button>
        </div>
      </div>

      {activeTab === 'submit' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Submission Form */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span>Report Local Flood Hazard</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Anonymous citizen report. No personal phone, email, or precise GPS collected.
              </p>
            </div>

            {/* Validation Error Banner */}
            {validationError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3.5 flex items-start gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* District Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  District *
                </label>
                <select
                  id="report-district-select"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                  required
                >
                  {districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Location Description (optional max 200) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Location Description (Optional)
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">{locationDescription.length}/200</span>
                </div>
                <input
                  type="text"
                  id="report-location-input"
                  maxLength={200}
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
                  placeholder="e.g., Near Tolichowki Flyover, Nadeem Colony Main Rd"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Incident Type Grid */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Incident Type *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { type: 'Urban Flooding', icon: <Building className="w-3.5 h-3.5" /> },
                    { type: 'Road Flooding', icon: <Car className="w-3.5 h-3.5" /> },
                    { type: 'Water Entering Buildings', icon: <Building className="w-3.5 h-3.5" /> },
                    { type: 'Drainage Overflow', icon: <Droplets className="w-3.5 h-3.5" /> },
                    { type: 'River Overflow', icon: <Waves className="w-3.5 h-3.5" /> },
                    { type: 'Other', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
                  ].map(({ type, icon }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setIncidentType(type as IncidentType)}
                      className={`flex items-center gap-1.5 p-2 rounded-lg text-xs font-semibold border transition-all text-left ${
                        incidentType === type
                          ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {icon}
                      <span className="truncate">{type}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Severity Buttons */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Observed Severity: <span className="text-blue-600 font-extrabold">{severity}</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Low', 'Moderate', 'High', 'Critical'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverity(sev)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        severity === sev
                          ? sev === 'Critical'
                            ? 'bg-red-600 text-white border-red-600 shadow-xs'
                            : sev === 'High'
                            ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                            : sev === 'Moderate'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                            : 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description textarea */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Detailed Observation Description *
                  </label>
                  <span className={`text-[11px] font-mono ${description.length < 10 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {description.length}/1000 {description.length < 10 && '(min 10)'}
                  </span>
                </div>
                <textarea
                  id="report-description-input"
                  rows={4}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detail observed water height (ankle, knee, waist), road blockages, vehicle stranding, drainage bottlenecks, or backflow."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed"
                  required
                />
              </div>

              {/* Optional Image Upload */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Optional Photo Evidence (Max 5MB)
                </label>
                {imagePreview ? (
                  <div className="relative border border-slate-300 rounded-lg p-2 bg-slate-50 flex items-center justify-between">
                    <img src={imagePreview} alt="Preview" className="h-16 w-24 object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => setImagePreview(null)}
                      className="px-3 py-1.5 text-xs bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-semibold flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 rounded-lg p-3 text-center bg-slate-50 text-xs text-slate-500 flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-colors">
                    <Camera className="w-4 h-4 text-slate-400" />
                    <span>Upload field photo (JPEG, PNG, WEBP)</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <button
                type="submit"
                id="report-submit-btn"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'AI Classifying & Storing...' : 'Submit Incident Report'}</span>
              </button>
            </form>
          </div>

          {/* Real-time Triage & Recent Feed */}
          <div className="lg:col-span-6 space-y-5">
            {/* Live AI Classification Confirmation Banner */}
            {submissionSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3 text-xs text-slate-800 shadow-sm animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Report #{submissionSuccess.report.id} Successfully Processed</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-mono text-[10px] font-bold">
                    {submissionSuccess.classification_source}
                  </span>
                </div>

                <div className="bg-white p-3.5 rounded-lg border border-emerald-100 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <div><b>Incident Type:</b> <span className="text-slate-900">{submissionSuccess.classification.incident_type}</span></div>
                    <div><b>AI Severity:</b> <span className="text-slate-900 font-bold">{submissionSuccess.classification.severity}</span></div>
                    <div><b>Triage Priority:</b> <span>{getPriorityBadge(submissionSuccess.classification.priority)}</span></div>
                    <div><b>District:</b> <span className="text-slate-900 font-semibold">{submissionSuccess.report.district_id}</span></div>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <b className="text-slate-700">AI Summary:</b>
                    <p className="text-slate-600 mt-0.5">{submissionSuccess.classification.summary}</p>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <b className="text-emerald-700">Recommended Public Safety Guidance:</b>
                    <p className="text-slate-600 mt-0.5">{submissionSuccess.classification.recommended_action}</p>
                  </div>
                  {submissionSuccess.updated_district && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-slate-700">
                      <span>Updated {submissionSuccess.report.district_id} Risk Index:</span>
                      <span className="font-extrabold text-blue-700 text-sm">
                        {submissionSuccess.updated_district.flood_risk_score}/100 ({submissionSuccess.updated_district.risk_category})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recent Verified Ground Feed */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Live Citizen Intelligence Feed</h3>
                  <p className="text-xs text-slate-500">Persistent SQLite storage with AI classification</p>
                </div>
                <button
                  onClick={fetchReports}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                  title="Refresh reports"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {isLoadingReports ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading ground reports...</div>
              ) : reports.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">No reports recorded yet.</div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {reports.map((rep) => (
                    <div
                      key={rep.id}
                      className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-2 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{rep.district_id || rep.district}</span>
                            {rep.location_description && (
                              <span className="text-xs text-slate-500 font-medium">({rep.location_description})</span>
                            )}
                            {getStatusBadge(rep.status)}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <Clock className="w-3 h-3" />
                            <span>{rep.created_at || rep.reported_at}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              {getIncidentIcon(rep.incident_type)}
                              <b>{rep.incident_type}</b>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                            rep.severity === 'Critical' ? 'bg-red-100 text-red-700' :
                            rep.severity === 'High' ? 'bg-orange-100 text-orange-700' :
                            rep.severity === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {rep.severity}
                          </span>
                          {getPriorityBadge(rep.priority)}
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200 leading-relaxed italic">
                        "{rep.description}"
                      </p>

                      {rep.summary && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
                          <Sparkles className="w-3 h-3 text-blue-500 shrink-0" />
                          <span className="truncate"><b>AI Summary:</b> {rep.summary}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* PROJECT DEMO REVIEW PANEL */
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          {/* Transparency & Scope Banner */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-950 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-extrabold flex items-center gap-2 text-sm text-indigo-900">
                <span>PROJECT DEMO REVIEW PANEL</span>
                <span className="px-2 py-0.5 rounded bg-indigo-200 text-indigo-800 text-[10px] font-mono">
                  DEMO ONLY - NOT OFFICIAL GOVERNMENT DISPATCH
                </span>
              </div>
              <p>
                This internal review panel permits reviewing, validating, and updating crowdsourced hazard entries. Changing a report's status immediately updates SQLite persistence and triggers real-time district risk recalculation.
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Filter District</label>
              <select
                id="review-district-filter"
                value={filterDistrict}
                onChange={(e) => setFilterDistrict(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value="All">All 33 Districts</option>
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Filter Severity</label>
              <select
                id="review-severity-filter"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value="All">All Severities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Moderate">Moderate</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Filter Status</label>
              <select
                id="review-status-filter"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="New">New</option>
                <option value="Reviewed">Reviewed</option>
                <option value="Validated">Validated</option>
                <option value="Resolved">Resolved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={fetchReports}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Table</span>
              </button>
            </div>
          </div>

          {/* Review List */}
          {isLoadingReports ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading reports for review...</div>
          ) : reports.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">No reports match the selected filters.</div>
          ) : (
            <div className="space-y-4">
              {reports.map((rep) => (
                <div
                  key={rep.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-slate-900 text-sm">#{rep.id}</span>
                      <span className="font-bold text-slate-900 text-sm">{rep.district_id || rep.district}</span>
                      {rep.location_description && (
                        <span className="text-xs text-slate-500 font-medium">({rep.location_description})</span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                        {rep.incident_type}
                      </span>
                      {getStatusBadge(rep.status)}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono">{rep.created_at || rep.reported_at}</span>
                      {getPriorityBadge(rep.priority)}
                    </div>
                  </div>

                  {/* Body & AI Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
                    <div className="md:col-span-6 space-y-2">
                      <span className="font-bold text-slate-700 block">Citizen Field Observation:</span>
                      <p className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-800 leading-relaxed italic">
                        "{rep.description}"
                      </p>
                      {rep.image_reference && (
                        <div className="pt-1">
                          <img src={rep.image_reference} alt="Field Observation" className="h-20 w-32 object-cover rounded border" />
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-6 space-y-2 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                          <span>Structured AI Classification</span>
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-white border border-slate-200 rounded font-semibold text-slate-600">
                          {rep.classification_source} ({rep.model_name || 'llama3.2:3b'})
                        </span>
                      </div>

                      <div className="space-y-1.5 text-slate-700">
                        <div><b>Impact Scope:</b> {rep.impact || 'Localized area'}</div>
                        <div><b>AI Summary:</b> {rep.summary || rep.description.slice(0, 100)}</div>
                        <div><b>Recommended Action:</b> {rep.recommended_action || 'Avoid submerged roads.'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-600">Change Status:</span>
                      {(['New', 'Reviewed', 'Validated', 'Resolved', 'Rejected'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => handleStatusChange(rep.id, st)}
                          disabled={rep.status === st || updatingReportId === rep.id}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
                            rep.status === st
                              ? 'bg-slate-900 text-white border-slate-900 cursor-default'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 disabled:opacity-50'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <span className="text-[11px] text-slate-400">
                      Auto-synced with SQLite & Risk Engine
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
