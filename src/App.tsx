import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  MapPin, 
  Calendar, 
  Clock, 
  Users, 
  Video, 
  VideoOff, 
  Music, 
  ChevronRight,
  Filter,
  X,
  CheckCircle2,
  Activity,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RPDEvent {
  id: number;
  title: string;
  description: string;
  playlist: string;
  format: 'memory' | 'video';
  location: string;
  date: string;
  time: string;
  video_recorded: number;
  proficiency: 'beginner' | 'mid' | 'pro';
  artist_type: 'girl_group' | 'boy_group' | 'mixed';
  rsvp_count: number;
}

export default function App() {
  const [events, setEvents] = useState<RPDEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [rsvpEmail, setRSVPEmail] = useState('');
  const [eventRSVPs, setEventRSVPs] = useState<{email: string, created_at: string}[]>([]);
  const [showRSVPList, setShowRSVPList] = useState(false);
  const [isCreatorVerified, setIsCreatorVerified] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<RPDEvent | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterProficiency, setFilterProficiency] = useState('');
  const [filterArtistType, setFilterArtistType] = useState('');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (filterLocation) params.append('location', filterLocation);
      if (filterProficiency) params.append('proficiency', filterProficiency);
      if (filterArtistType) params.append('artist_type', filterArtistType);

      const res = await fetch(`/api/events?${params.toString()}`);
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [searchQuery, filterLocation, filterProficiency, filterArtistType]);

  useEffect(() => {
    setIsCreatorVerified(false);
    setShowRSVPList(false);
    if (selectedEvent) {
      fetch(`/api/events/${selectedEvent.id}/rsvps`)
        .then(res => res.json())
        .then(data => setEventRSVPs(data))
        .catch(() => {});
    }
  }, [selectedEvent]);

  const verifyCreator = () => {
    const email = prompt("Enter the creator email address to manage this event:");
    if (email === selectedEvent?.creator_email) {
      setIsCreatorVerified(true);
      setShowRSVPList(true);
    } else if (email) {
      alert("Email does not match the creator of this event.");
    }
  };

  const handleRSVP = async (eventId: number) => {
    if (!rsvpEmail) {
      setShowRSVPModal(true);
      return;
    }

    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: rsvpEmail })
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, rsvp_count: data.rsvp_count } : e));
        if (selectedEvent?.id === eventId) {
          setSelectedEvent(prev => prev ? { ...prev, rsvp_count: data.rsvp_count } : null);
        }
        setShowRSVPModal(false);
        setRSVPEmail('');
        alert('RSVP successful! Check your email for details (and your Spam folder just in case).');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to RSVP');
      }
    } catch (err) {
      console.error('RSVP error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-black/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Music size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">RPD Hub</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search events, artists, playlists..."
                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              onClick={async () => {
              try {
                const res = await fetch('/api/debug');
                const data = await res.json();
                const statusMsg = `System Status:\n\nSMTP Host: ${data.smtp_host}\nSMTP Port: ${data.smtp_port}\nNetwork Status: ${data.smtp_port_status}\nSMTP Configured: ${data.smtp_configured}\nSMTP From: ${data.smtp_from}`;
                
                if (confirm(`${statusMsg}\n\nWould you like to send a test email?`)) {
                  const testEmail = prompt("Enter email address for test:");
                  if (testEmail) {
                    const testRes = await fetch('/api/debug/test-email', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: testEmail })
                    });
                    const testData = await testRes.json();
                    if (testData.success) alert("✅ Test email sent! Check your inbox (and spam).");
                    else alert(`❌ Failed: ${testData.error}`);
                  }
                }
              } catch (err) {
                alert('Could not reach backend debug endpoint.');
              }
            }}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
              title="Check System Status"
            >
              <Activity size={20} />
            </button>
            <button 
              onClick={() => setShowPostModal(true)}
              className="bg-black text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-800 transition-colors shadow-sm"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Post Event</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <aside className="lg:w-64 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
              <div className="flex items-center gap-2 mb-4 text-gray-500 font-semibold text-sm uppercase tracking-wider">
                <Filter size={16} />
                Filters
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Location</label>
                  <input 
                    type="text" 
                    placeholder="City or Venue"
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Proficiency</label>
                  <select 
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                    value={filterProficiency}
                    onChange={(e) => setFilterProficiency(e.target.value)}
                  >
                    <option value="">All Levels</option>
                    <option value="beginner">Beginner</option>
                    <option value="mid">Mid</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Artist Type</label>
                  <select 
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                    value={filterArtistType}
                    onChange={(e) => setFilterArtistType(e.target.value)}
                  >
                    <option value="">All Artists</option>
                    <option value="girl_group">Girl Groups Only</option>
                    <option value="boy_group">Boy Groups Only</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>

                {(filterLocation || filterProficiency || filterArtistType) && (
                  <button 
                    onClick={() => {
                      setFilterLocation('');
                      setFilterProficiency('');
                      setFilterArtistType('');
                    }}
                    className="text-xs text-indigo-600 font-medium hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* Event Grid */}
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-64 bg-gray-200 animate-pulse rounded-2xl"></div>
                ))}
              </div>
            ) : events.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {events.map((event) => (
                  <motion.div 
                    layoutId={`event-${event.id}`}
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className="group bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ${
                        event.proficiency === 'pro' ? 'bg-red-100 text-red-600' :
                        event.proficiency === 'mid' ? 'bg-orange-100 text-orange-600' :
                        'bg-green-100 text-green-600'
                      }`}>
                        {event.proficiency}
                      </span>
                    </div>

                    <div className="flex flex-col h-full">
                      <h3 className="text-xl font-bold mb-2 group-hover:text-indigo-600 transition-colors">{event.title}</h3>
                      
                      <div className="space-y-2 mb-4 flex-1">
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                          <MapPin size={14} />
                          <span>{event.location}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                          <Calendar size={14} />
                          <span>{new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                          <Clock size={14} />
                          <span>{event.time}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                        <div className="flex items-center gap-2 text-indigo-600 font-semibold">
                          <Users size={16} />
                          <span>{event.rsvp_count} RSVP'd</span>
                        </div>
                        <div className="text-gray-400 group-hover:text-indigo-600 transition-colors">
                          <ChevronRight size={20} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                  <Search size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900">No events found</h3>
                <p className="text-gray-500">Try adjusting your filters or search terms.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Event Detail Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEvent(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              layoutId={`event-${selectedEvent.id}`}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <button 
                onClick={() => setSelectedEvent(null)}
                className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors z-10"
              >
                <X size={20} />
              </button>

              <div className="overflow-y-auto p-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wider">
                    {selectedEvent.artist_type.replace('_', ' ')}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    selectedEvent.proficiency === 'pro' ? 'bg-red-100 text-red-700' :
                    selectedEvent.proficiency === 'mid' ? 'bg-orange-100 text-orange-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {selectedEvent.proficiency}
                  </span>
                </div>

                <h2 className="text-3xl font-bold mb-6">{selectedEvent.title}</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                        <MapPin size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Location</p>
                        <p className="font-medium">{selectedEvent.location}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Date & Time</p>
                        <p className="font-medium">{new Date(selectedEvent.date).toLocaleDateString()} at {selectedEvent.time}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                        {selectedEvent.video_recorded ? <Video size={18} /> : <VideoOff size={18} />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Video Policy</p>
                        <p className="font-medium">{selectedEvent.video_recorded ? 'Will be recorded & posted' : 'No public recording'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                        <Users size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Format</p>
                        <p className="font-medium capitalize">{selectedEvent.format === 'memory' ? 'Dancing from memory' : 'Video/Choreo provided'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-400 uppercase">Description</h4>
                    {!showRSVPList && (
                      <button 
                        onClick={verifyCreator}
                        className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <Settings size={12} />
                        Manage Event
                      </button>
                    )}
                    {showRSVPList && (
                      <button 
                        onClick={() => setShowRSVPList(false)}
                        className="text-xs font-bold text-gray-500 hover:underline"
                      >
                        Back to Details
                      </button>
                    )}
                  </div>

                  {showRSVPList && isCreatorVerified ? (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-bold text-gray-700">Attendee Emails ({eventRSVPs.length})</h5>
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold">Creator View</span>
                      </div>
                      {eventRSVPs.length > 0 ? (
                        <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                          {eventRSVPs.map((rsvp, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                              <span className="text-sm font-medium text-gray-700">{rsvp.email}</span>
                              <span className="text-[10px] text-gray-400">{new Date(rsvp.created_at).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No RSVPs yet.</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-gray-700 leading-relaxed">{selectedEvent.description}</p>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-gray-400 uppercase mb-2">Playlist</h4>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 whitespace-pre-wrap font-mono text-sm">
                          {selectedEvent.playlist}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] font-bold">
                        {String.fromCharCode(64 + i)}
                      </div>
                    ))}
                  </div>
                  <span className="text-sm font-bold text-gray-600">{selectedEvent.rsvp_count} people attending</span>
                </div>
                <button 
                  onClick={() => handleRSVP(selectedEvent.id)}
                  className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                >
                  RSVP Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RSVP Email Modal */}
      <AnimatePresence>
        {showRSVPModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRSVPModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-8"
            >
              <h2 className="text-2xl font-bold mb-4">Confirm RSVP</h2>
              <p className="text-gray-600 mb-6">Enter your email to receive event details and confirm your spot.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    placeholder="you@example.com" 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={rsvpEmail}
                    onChange={(e) => setRSVPEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && selectedEvent && handleRSVP(selectedEvent.id)}
                  />
                </div>
                <button 
                  onClick={() => selectedEvent && handleRSVP(selectedEvent.id)}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                >
                  Confirm & Send Details
                </button>
                <button 
                  onClick={() => setShowRSVPModal(false)}
                  className="w-full text-gray-500 font-medium py-2 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Post Event Modal */}
      <AnimatePresence>
        {showPostModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPostModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-bold">Post New RPD Event</h2>
                <button onClick={() => setShowPostModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data = Object.fromEntries(formData.entries());
                  
                  try {
                    const res = await fetch('/api/events', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ...data,
                        video_recorded: data.video_recorded === 'on'
                      })
                    });
                    if (res.ok) {
                      setShowPostModal(false);
                      fetchEvents();
                      alert('Event created successfully! Check your email for confirmation (and your Spam folder).');
                    } else {
                      const errorData = await res.json();
                      alert(errorData.error || 'Failed to create event. Please check all fields.');
                    }
                  } catch (err) {
                    console.error('Failed to post event:', err);
                    alert('A network error occurred. Please try again.');
                  }
                }}
                className="overflow-y-auto p-8 space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Event Title</label>
                    <input name="title" required type="text" placeholder="e.g. Seoul Summer RPD 2024" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Location</label>
                    <input name="location" required type="text" placeholder="City, Venue" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
                      <input name="date" required type="date" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Time</label>
                      <input name="time" required type="time" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Proficiency Level</label>
                    <select name="proficiency" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="beginner">Beginner</option>
                      <option value="mid">Mid</option>
                      <option value="pro">Pro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Artist Type</label>
                    <select name="artist_type" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="mixed">Mixed</option>
                      <option value="girl_group">Girl Groups Only</option>
                      <option value="boy_group">Boy Groups Only</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Your Email (for notifications)</label>
                    <input name="creator_email" required type="email" placeholder="you@example.com" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Format</label>
                    <select name="format" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="memory">From Memory</option>
                      <option value="video">Video/Choreo Provided</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3 pt-8">
                    <input name="video_recorded" type="checkbox" id="video_recorded" className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <label htmlFor="video_recorded" className="text-sm font-bold text-gray-700">Will be recorded & posted online</label>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                    <textarea name="description" rows={3} placeholder="Tell people about the event..." className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Playlist</label>
                    <textarea name="playlist" rows={4} placeholder="List the songs..." className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"></textarea>
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  <button type="submit" className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg active:scale-[0.98]">
                    Create Event
                  </button>
                  
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-2">Trouble with emails? Test your SMTP settings:</p>
                    <div className="flex gap-2">
                      <input 
                        type="email" 
                        id="test-email-input"
                        placeholder="Test email address" 
                        className="flex-1 p-2 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none"
                      />
                      <button 
                        type="button"
                        onClick={async () => {
                          const email = (document.getElementById('test-email-input') as HTMLInputElement).value;
                          if (!email) return alert('Enter an email to test');
                          try {
                            const res = await fetch('/api/test-email', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ email })
                            });
                            const data = await res.json();
                            if (res.ok) alert(data.message);
                            else alert('SMTP Error: ' + data.error);
                          } catch (err) {
                            alert('Network error testing SMTP');
                          }
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Test SMTP
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
