import { useState, useEffect, useRef } from "react";
import "./App.css";
import { rankProviders } from "./utils/matchingEngine.js";
import {
  fetchProviders,
  matchProvidersApi,
  createBookingApi,
  checkBackendHealth,
  loginApi,
  registerApi,
  getBookingsApi,
  clearAuthToken,
  getAuthToken,
} from "./services/api.js";

const IS_DEVELOPMENT = import.meta.env.DEV;

const initialDemoProviders = [
  {
    id: 1,
    name: "Amit Sharma",
    service: "AC Repair Specialist",
    rating: 4.9,
    reviews: 128,
    distance: 1.8,
    experience: 5,
    available: true,
    skills: ["AC Repair", "HVAC", "Maintenance"],
    price: 499,
    initials: "AS",
    color: "#dbeafe",
  },
  {
    id: 2,
    name: "Rahul Patel",
    service: "Home Appliance Expert",
    rating: 4.7,
    reviews: 96,
    distance: 2.5,
    experience: 4,
    available: true,
    skills: ["AC Repair", "Refrigerator"],
    price: 399,
    initials: "RP",
    color: "#dcfce7",
  },
  {
    id: 3,
    name: "Priya Shah",
    service: "Electrical Specialist",
    rating: 4.8,
    reviews: 112,
    distance: 3.2,
    experience: 6,
    available: true,
    skills: ["Electrical", "Wiring", "Maintenance"],
    price: 449,
    initials: "PS",
    color: "#f3e8ff",
  },
  {
    id: 4,
    name: "Vikram Singh",
    service: "Professional Technician",
    rating: 4.6,
    reviews: 74,
    distance: 4.1,
    experience: 3,
    available: false,
    skills: ["AC Repair", "Maintenance"],
    price: 349,
    initials: "VS",
    color: "#ffedd5",
  },
];

const categories = [
  { icon: "❄️", name: "AC Repair" },
  { icon: "🔧", name: "Plumbing" },
  { icon: "⚡", name: "Electrical" },
  { icon: "🧹", name: "Cleaning" },
  { icon: "💻", name: "Computer Repair" },
  { icon: "🚗", name: "Car Repair" },
];

function App() {
  const [query, setQuery] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [searched, setSearched] = useState(false);
  const [booking, setBooking] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [message, setMessage] = useState("");
  
  // Backend Integration State
  const [providersList, setProvidersList] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providerError, setProviderError] = useState("");
  const [providersAreDemo, setProvidersAreDemo] = useState(false);
  const [matchesAreDemo, setMatchesAreDemo] = useState(false);
  const [matching, setMatching] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingsError, setBookingsError] = useState("");
  const offlineDemoSequence = useRef(0);

  // Auth state
  const [currentUser, setCurrentUser] = useState(null); // { name, email, role } from token response
  const [authView, setAuthView] = useState(null);       // null | "login" | "register"
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  async function loadUserBookings() {
    setBookingsError("");
    try {
      const response = await getBookingsApi();
      setBookings((response.data || []).map((item) => ({
        ...item,
        id: item.id || item.bookingId,
        provider: item.provider || item.providerName,
      })));
    } catch (err) {
      console.warn("Unable to load bookings for the signed-in user.", err);
      if (!getAuthToken()) {
        setCurrentUser(null);
        setAuthView("login");
        setMessage("Your session has expired. Please log in again.");
      }
      setBookingsError("Your bookings are temporarily unavailable.");
    }
  }

  // Load initial providers from REST API on mount
  useEffect(() => {
    let isMounted = true;

    async function loadInitialProviders() {
      const healthPromise = checkBackendHealth().catch((err) => {
        console.warn("Backend health check failed.", err);
        return null;
      });

      try {
        const response = await fetchProviders();
        const health = await healthPromise;
        if (!isMounted) return;
        setProvidersList(response.data || []);
        setProvidersAreDemo(health?.database === "demo_fallback");
        setRecommendations(rankProviders(response.data || [], {}));
        setMatchesAreDemo(false);
      } catch (err) {
        console.warn("Backend connection unavailable.", err);
        if (!isMounted) return;
        const networkUnavailable = err.code === "NetworkError";
        if (IS_DEVELOPMENT && networkUnavailable) {
          setProvidersAreDemo(true);
          setProvidersList(initialDemoProviders);
          setRecommendations(rankProviders(initialDemoProviders, {}));
        } else {
          setProvidersAreDemo(false);
          setProvidersList([]);
          setRecommendations([]);
          setProviderError("Service providers are temporarily unavailable. Please try again later.");
        }
      } finally {
        if (isMounted) setLoadingProviders(false);
      }
    }

    loadInitialProviders();
    return () => {
      isMounted = false;
    };
  }, []);

  const [aiInterpretation, setAiInterpretation] = useState(null);

  // ── Auth handlers ───────────────────────────────────────────────────────────

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const data = await loginApi({ email: authEmail, password: authPassword });
      setCurrentUser(data.user);
      setAuthView(null);
      setAuthEmail("");
      setAuthPassword("");
      await loadUserBookings();
    } catch (err) {
      setAuthError(err.message || "Login failed. Check your credentials.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const data = await registerApi({ name: authName, email: authEmail, password: authPassword });
      setCurrentUser(data.user);
      setAuthView(null);
      setAuthName("");
      setAuthEmail("");
      setAuthPassword("");
      await loadUserBookings();
    } catch (err) {
      setAuthError(err.message || "Registration failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    clearAuthToken();
    setCurrentUser(null);
    setBookings([]);
    setBookingsError("");
  }

  // ── Booking & matching ──────────────────────────────────────────────────────

  async function findMatches() {
    const text = `${query} ${selectedService}`.toLowerCase();

    if (!text.trim()) {
      setMessage("Please describe your problem or select a service.");
      return;
    }

    setMessage("");
    setMatching(true);
    setSearched(true);

    try {
      const result = await matchProvidersApi({
        query,
        selectedService,
        useAI: true
      });
      setRecommendations(result.data || []);
      setAiInterpretation(result.aiInterpretation || null);
      setMatchesAreDemo(false);
      setMessage("");
    } catch (err) {
      console.warn("Match API unavailable, executing client fallback matching", err);
      const networkUnavailable = err.code === "NetworkError";
      setAiInterpretation(null);
      if (IS_DEVELOPMENT && networkUnavailable) {
        const fallbackResults = rankProviders(providersList, {
          selectedService,
          query,
        });
        setRecommendations(fallbackResults);
        setMatchesAreDemo(true);
        setMessage("Development demo: matches were calculated locally and were not checked by the backend.");
      } else {
        setRecommendations([]);
        setMatchesAreDemo(false);
        setMessage("Matching is temporarily unavailable. Please try again later.");
      }
    } finally {
      setMatching(false);
    }
  }

  async function bookProvider(provider) {
    if (submittingBooking) return;

    // Require authentication before booking
    if (!currentUser) {
      setAuthView("login");
      setMessage("Please log in to book a provider.");
      return;
    }

    setSubmittingBooking(true);

    // Only pass providerId and service — price and providerName are resolved server-side.
    const bookingPayload = {
      providerId: provider.id,
      service: selectedService || provider.service,
    };

    try {
      const result = await createBookingApi(bookingPayload);
      const createdBooking = {
        ...result.data,
        id: result.data?.id || result.data?.bookingId,
        provider: result.data?.provider || result.data?.providerName || provider.name,
        isDemoMode: result.isDemoMode === true || result.data?.isDemoMode === true,
        isOfflineDemo: false,
      };
      setBookings((previous) => [createdBooking, ...previous]);
      setBooking(createdBooking);
      setBookingsError("");
    } catch (err) {
      // If the token was cleared (401/403), prompt login
      if (err.message.includes("Not authenticated") || err.message.includes("log in")) {
        setCurrentUser(null);
        setAuthView("login");
        setMessage("Your session has expired. Please log in again.");
      } else if (IS_DEVELOPMENT && err.code === "NetworkError") {
        const fallbackBooking = {
          id: `OFFLINE-DEMO-${++offlineDemoSequence.current}`,
          provider: provider.name,
          service: selectedService || provider.service,
          price: provider.price,
          status: "Requested (Offline Demo)",
          isDemoMode: true,
          isOfflineDemo: true,
        };
        setBookings((previous) => [fallbackBooking, ...previous]);
        setBooking(fallbackBooking);
      } else {
        setMessage(`Booking failed: ${err.message}`);
      }
    } finally {
      setSubmittingBooking(false);
    }
  }

  return (
    <div className="app">
      <nav className="navbar">
        <a className="brand" href="#home">
          <span className="brand-icon">✦</span>
          <span>
            ServiceMatch<span className="brand-ai"> AI</span>
            <small>SMARTER SERVICE. BETTER LIFE.</small>
          </span>
        </a>

        <div className="nav-links">
          <a href="#home">Home</a>
          <a href="#services">Services</a>
          <a href="#providers">Find Providers</a>
          <a href="#bookings">My Bookings ({bookings.length})</a>
        </div>

        {currentUser ? (
          <div className="nav-auth">
            <span className="nav-user">👤 {currentUser.name}</span>
            <button className="nav-button nav-button-outline" onClick={handleLogout}>
              Log out
            </button>
          </div>
        ) : (
          <div className="nav-auth">
            <button className="nav-button nav-button-outline" onClick={() => { setAuthView("login"); setAuthError(""); }}>
              Log in
            </button>
            <button className="nav-button" onClick={() => { setAuthView("register"); setAuthError(""); }}>
              Sign up
            </button>
          </div>
        )}
      </nav>

      <main>
        <section className="hero" id="home">
          <div className="hero-content">
            <div className="eyebrow">
              <span className="sparkle">✦</span>
              YOUR PERSONAL SERVICE ASSISTANT
            </div>

            <h1>
              The right help.
              <br />
              <span>Right when you need it.</span>
            </h1>

            <p className="hero-description">
              Tell us what you need. Discover trusted professionals matched
              to your skills, schedule and budget.
            </p>

            <div className="trust-row">
              <span>✓ Trusted professionals</span>
              <span>✓ Smart matching</span>
              <span>✓ Easy booking</span>
            </div>
          </div>

          <div className="search-panel">
            <div className="search-title">
              <div>
                <span className="search-label">LET'S GET IT FIXED</span>
                <h2>What can we help you with?</h2>
              </div>
              <span className="search-icon">⌕</span>
            </div>

            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Describe your problem... e.g. My AC is not cooling and I need someone today evening."
            />

            <div className="input-bottom">
              <span>✦ Describe it in your own words</span>
              <span>{query.length}/500</span>
            </div>

            <div className="search-divider" />

            <label className="field-label">OR SELECT A SERVICE</label>

            <div className="service-select">
              <select
                value={selectedService}
                onChange={(event) => setSelectedService(event.target.value)}
              >
                <option value="">Choose a service</option>
                {categories.map((category) => (
                  <option key={category.name} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <button className="primary-button" onClick={findMatches} disabled={matching}>
              <span>✦</span> {matching ? "Calculating Best Matches..." : "Find My Best Match"} <span>→</span>
            </button>

            {message && <p className="error-message">{message}</p>}

            <p className="privacy-note">
              🔒 Your request is used to find suitable service providers.
            </p>
          </div>

          <div className="hero-decoration decoration-one" />
          <div className="hero-decoration decoration-two" />
        </section>

        <section className="categories section-container" id="services">
          <div className="section-heading">
            <div>
              <span className="section-label">WHAT DO YOU NEED?</span>
              <h2>Explore our services</h2>
            </div>
            <span className="subtle-text">Simple solutions for everyday needs</span>
          </div>

          <div className="category-grid">
            {categories.map((category) => (
              <button
                className={`category-card ${
                  selectedService === category.name ? "selected" : ""
                }`}
                key={category.name}
                onClick={() => {
                  setSelectedService(category.name);
                  setMessage("");
                }}
              >
                <span className="category-icon">{category.icon}</span>
                <span>{category.name}</span>
                <span className="category-arrow">↗</span>
              </button>
            ))}
          </div>
        </section>

        <section className="providers-section section-container" id="providers">
          <div className="section-heading provider-heading">
            <div>
              <span className="section-label">
                {searched ? "YOUR SEARCH RESULTS" : "HANDPICKED FOR YOU"}
              </span>
              <h2>
                {searched ? "Your matching professionals" : "Meet your local experts"}
              </h2>
              <p className="subtle-text">
                {searched
                  ? matchesAreDemo
                    ? "Matches calculated locally in development because backend matching is unavailable."
                    : providersAreDemo
                    ? "Providers ranked using the development demo matching algorithm."
                    : "Providers ranked by relevance to your request."
                  : "Skilled professionals, ready to help you."}
              </p>
              {aiInterpretation && (
                <div style={{ marginTop: "10px", fontSize: "11px", color: "#6b7280", background: "#f8f6ff", padding: "6px 12px", borderRadius: "8px", border: "1px solid #e9e5ff" }}>
                  ✨ <strong>AI Analysis:</strong> Detected Service: <strong>{aiInterpretation.service}</strong> | Time: <strong>{aiInterpretation.preferredTime}</strong> | Urgency: <strong>{aiInterpretation.urgency}</strong>
                  {aiInterpretation.isAIGenerated ? " (Gemini LLM)" : " (Rule Parser Fallback)"}
                </div>
              )}
            </div>

            <span className="results-badge">
              {recommendations.length} professionals
            </span>
          </div>

          {loadingProviders && <p className="subtle-text" role="status">Loading service providers...</p>}
          {providerError && <p className="error-message" role="alert">{providerError}</p>}
          {!loadingProviders && !providerError && recommendations.length === 0 && (
            <div className="empty-bookings">
              <h3>No providers available</h3>
              <p>Please try again later.</p>
            </div>
          )}

          <div className="provider-grid">
            {recommendations.map((provider, index) => (
              <article className="provider-card" key={provider.id}>
                {index === 0 && (
                  <div className="best-match-badge">✦ BEST MATCH</div>
                )}

                <div className="provider-top">
                  <div
                    className="avatar"
                    style={{ backgroundColor: provider.color }}
                  >
                    {provider.initials}
                  </div>

                  <div className="provider-info">
                    <h3>{provider.name}</h3>
                    <p>{provider.service}</p>
                    <div className="rating">
                      <span>★</span> {provider.rating}{" "}
                      <span className="review-count">
                        ({provider.reviews} reviews)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="provider-stats">
                  <div>
                    <span>📍</span> {provider.distance} km
                  </div>
                  <div>
                    <span>◷</span> {provider.experience} years
                  </div>
                </div>

                <div className="skill-list">
                  {provider.skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>

                <div className="availability-row">
                  <span
                    className={
                      provider.available ? "available" : "unavailable"
                    }
                  >
                    ● {provider.available ? "Available today" : "Busy today"}
                  </span>
                  <span className="price">From ₹{provider.price}</span>
                </div>

                <div className="match-container">
                  <div className="match-label">
                    <span>Match score</span>
                    <strong>{provider.calculatedScore}%</strong>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${provider.calculatedScore}%` }}
                    />
                  </div>
                  {provider.matchDetails?.explanation && (
                    <p className="match-explanation">
                      💡 {provider.matchDetails.explanation}
                      {provider.matchDetails.breakdown?.isQualityDemoFallback && (
                        <span className="quality-tag" title="Past service quality using demo fallback score">
                          Demo Quality
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <button
                  className="book-button"
                  disabled={!provider.available || submittingBooking}
                  onClick={() => bookProvider(provider)}
                >
                  {submittingBooking
                    ? "Processing..."
                    : provider.available
                    ? "Book Now →"
                    : "Currently Unavailable"}
                </button>
              </article>
            ))}
          </div>

          {providersAreDemo && IS_DEVELOPMENT && (
            <p className="demo-note" role="status">
              Development demo: provider profiles and scores are sample data, not
              verified real-world information. Bookings made offline are not sent to the backend.
            </p>
          )}
        </section>

        <section className="why-section">
          <div className="section-container">
            <div className="section-heading centered-heading">
              <span className="section-label">WHY SERVICEMATCH?</span>
              <h2>Less searching. More solving.</h2>
              <p className="subtle-text">
                Find the right professional without the usual hassle.
              </p>
            </div>

            <div className="benefit-grid">
              <div className="benefit-card">
                <span>✦</span>
                <h3>Smart Matching</h3>
                <p>Compare provider skills, ratings and availability.</p>
              </div>
              <div className="benefit-card">
                <span>✓</span>
                <h3>Clear Information</h3>
                <p>Review service details before you make a decision.</p>
              </div>
              <div className="benefit-card">
                <span>◷</span>
                <h3>Simple Booking</h3>
                <p>Create a booking request in just a few clicks.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-container bookings-section" id="bookings">
          <div className="section-heading">
            <div>
              <span className="section-label">YOUR ACTIVITY</span>
              <h2>My bookings</h2>
            </div>
            <span className="results-badge">{bookings.length} bookings</span>
          </div>

          {bookingsError && <p className="error-message" role="alert">{bookingsError}</p>}

          {!bookingsError && bookings.length === 0 ? (
            <div className="empty-bookings">
              <span>📅</span>
              <h3>No bookings yet</h3>
              <p>Your booking requests will appear here.</p>
            </div>
          ) : !bookingsError ? (
            <div className="booking-list">
              {bookings.map((item) => (
                <div className="booking-item" key={item.id}>
                  <div>
                    <strong>{item.provider}</strong>
                    <p>{item.service}</p>
                    <small>Booking ID: {item.id}</small>
                  </div>
                  <div>
                    <span className="booking-status">{item.status}</span>
                    <p>Estimated price: ₹{item.price}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </main>

      <footer className="footer">
        <a className="brand footer-brand" href="#home">
          <span className="brand-icon">✦</span>
          <span>
            ServiceMatch<span className="brand-ai"> AI</span>
            <small>SMARTER SERVICE. BETTER LIFE.</small>
          </span>
        </a>
        <p>Making everyday services easier to find.</p>
        <span>© 2026 ServiceMatch AI · Student MVP Demo</span>
      </footer>

      {booking && (
        <div className="modal-backdrop" onClick={() => setBooking(null)}>
          <div
            className="booking-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setBooking(null)}
              aria-label="Close booking confirmation"
            >
              ×
            </button>

            <div className="success-icon">✓</div>
            <span className="section-label">{booking.isDemoMode ? "DEVELOPMENT DEMO" : "REQUEST CREATED"}</span>
            <h2>{booking.isOfflineDemo ? "Offline demo booking created" : "Booking request submitted!"}</h2>
            <p>
              {booking.isOfflineDemo
                ? "This development demo booking was not sent to the backend."
                : booking.isDemoMode
                ? "The backend handled this development demo booking, but it was not persisted to MongoDB."
                : "Your booking request was sent to the service provider."}
            </p>

            <div className="confirmation-details">
              <div>
                <span>Provider</span>
                <strong>{booking.provider}</strong>
              </div>
              <div>
                <span>Service</span>
                <strong>{booking.service}</strong>
              </div>
              <div>
                <span>Estimated price</span>
                <strong>₹{booking.price}</strong>
              </div>
              <div>
                <span>Booking ID</span>
                <strong>{booking.id}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{booking.status}</strong>
              </div>
            </div>

            <button
              className="primary-button"
              onClick={() => {
                setBooking(null);
                document
                  .getElementById("bookings")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              View My Bookings →
            </button>
          </div>
        </div>
      )}

      {/* ── Login Modal ─────────────────────────────────────────────────── */}
      {authView === "login" && (
        <div className="modal-backdrop" onClick={() => setAuthView(null)}>
          <div className="booking-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAuthView(null)} aria-label="Close">×</button>
            <div className="success-icon">🔒</div>
            <span className="section-label">ACCOUNT ACCESS</span>
            <h2>Log in to ServiceMatch</h2>
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
              <input
                type="email"
                placeholder="Email address"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "14px" }}
              />
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "14px" }}
              />
              {authError && <p className="error-message">{authError}</p>}
              <button className="primary-button" type="submit" disabled={authLoading}>
                {authLoading ? "Logging in..." : "Log in →"}
              </button>
            </form>
            <p style={{ marginTop: "12px", fontSize: "13px", color: "#6b7280", textAlign: "center" }}>
              Don&apos;t have an account?{" "}
              <button style={{ background: "none", border: "none", color: "#7c3aed", cursor: "pointer", fontWeight: 600 }}
                onClick={() => { setAuthView("register"); setAuthError(""); }}>
                Sign up
              </button>
            </p>
          </div>
        </div>
      )}

      {/* ── Register Modal ──────────────────────────────────────────────── */}
      {authView === "register" && (
        <div className="modal-backdrop" onClick={() => setAuthView(null)}>
          <div className="booking-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAuthView(null)} aria-label="Close">×</button>
            <div className="success-icon">✦</div>
            <span className="section-label">CREATE ACCOUNT</span>
            <h2>Join ServiceMatch</h2>
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
              <input
                type="text"
                placeholder="Full name"
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
                required
                style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "14px" }}
              />
              <input
                type="email"
                placeholder="Email address"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "14px" }}
              />
              <input
                type="password"
                placeholder="Password (min. 8 characters)"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                minLength={8}
                style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "14px" }}
              />
              {authError && <p className="error-message">{authError}</p>}
              <button className="primary-button" type="submit" disabled={authLoading}>
                {authLoading ? "Creating account..." : "Create account →"}
              </button>
            </form>
            <p style={{ marginTop: "12px", fontSize: "13px", color: "#6b7280", textAlign: "center" }}>
              Already have an account?{" "}
              <button style={{ background: "none", border: "none", color: "#7c3aed", cursor: "pointer", fontWeight: 600 }}
                onClick={() => { setAuthView("login"); setAuthError(""); }}>
                Log in
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;