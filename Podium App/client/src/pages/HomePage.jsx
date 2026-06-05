import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { performancesApi, theatresApi } from '../services/api';
import { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, ArrowRight, Sparkles, Theater, Star } from 'lucide-react';
import './HomePage.css';

export default function HomePage() {
  const { user } = useAuth();
  const [upcomingPerformances, setUpcomingPerformances] = useState([]);
  const [theatres, setTheatres] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [perfData, theatreData] = await Promise.all([
        performancesApi.getAll({ limit: 6 }),
        theatresApi.getAll(),
      ]);
      setUpcomingPerformances(perfData.performances?.slice(0, 6) || []);
      setTheatres(theatreData.theatres?.slice(0, 6) || []);
    } catch (err) {
      console.error('Error loading homepage data:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-gradient" />
          <div className="hero-particles">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`particle particle-${i + 1}`} />
            ))}
          </div>
        </div>
        <div className="container hero-content">
          <div className="hero-badge animate-in">
            <Sparkles size={14} />
            <span>Het sociale platform voor theaterliefhebbers</span>
          </div>
          <h1 className="hero-title animate-in animate-in-delay-1">
            Ontdek, deel en beleef <br />
            <span className="text-gradient">het theater samen</span>
          </h1>
          <p className="hero-description animate-in animate-in-delay-2">
            Vind voorstellingen in heel Nederland, zie wie er nog meer gaat,
            en maak van elke theateravond een gedeelde ervaring.
          </p>
          <div className="hero-actions animate-in animate-in-delay-3">
            {user ? (
              <>
                <Link to="/agenda" className="btn btn-accent btn-lg">
                  <Calendar size={20} />
                  Bekijk de Agenda
                </Link>
                <Link to="/theaters" className="btn btn-outline btn-lg">
                  Ontdek Theaters
                </Link>
              </>
            ) : (
              <>
                <Link to="/registreren" className="btn btn-accent btn-lg">
                  Gratis Registreren
                  <ArrowRight size={20} />
                </Link>
                <Link to="/agenda" className="btn btn-outline btn-lg">
                  Bekijk Voorstellingen
                </Link>
              </>
            )}
          </div>
          <div className="hero-stats animate-in animate-in-delay-4">
            <div className="hero-stat">
              <Theater size={20} />
              <div>
                <strong>15+</strong>
                <span>Theaters</span>
              </div>
            </div>
            <div className="hero-stat">
              <Star size={20} />
              <div>
                <strong>60+</strong>
                <span>Voorstellingen</span>
              </div>
            </div>
            <div className="hero-stat">
              <Users size={20} />
              <div>
                <strong>Gratis</strong>
                <span>Registreren</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Performances */}
      <section className="section container">
        <div className="section-header">
          <div>
            <h2>Binnenkort op het Podium</h2>
            <p className="text-secondary">De eerstvolgende voorstellingen in Nederland</p>
          </div>
          <Link to="/agenda" className="btn btn-outline btn-sm">
            Alle voorstellingen
            <ArrowRight size={16} />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="card">
                <div className="skeleton" style={{ height: 200 }} />
                <div className="card-body">
                  <div className="skeleton" style={{ height: 24, width: '80%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 16, width: '60%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-3">
            {upcomingPerformances.map((perf, i) => (
              <Link
                to={`/voorstelling/${perf.id}`}
                key={perf.id}
                className="card performance-card animate-in"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="performance-card-image">
                  <div className="performance-genre-badge">
                    <span className="badge badge-accent">{perf.genre}</span>
                  </div>
                </div>
                <div className="card-body">
                  <h3 className="card-title">{perf.title}</h3>
                  <div className="card-subtitle">
                    <MapPin size={14} />
                    {perf.theatre_name} · {perf.theatre_city}
                  </div>
                  <div className="performance-card-footer">
                    <div className="card-meta">
                      <Calendar size={14} />
                      <span>{formatDate(perf.date_time)}</span>
                      <span className="text-accent">{formatTime(perf.date_time)}</span>
                    </div>
                    {perf.attendee_count > 0 && (
                      <div className="card-meta">
                        <Users size={14} />
                        <span>{perf.attendee_count} {perf.attendee_count === 1 ? 'gaat' : 'gaan'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Theatres */}
      <section className="section container">
        <div className="section-header">
          <div>
            <h2>Theaters in Nederland</h2>
            <p className="text-secondary">Ontdek de mooiste podia van het land</p>
          </div>
          <Link to="/theaters" className="btn btn-outline btn-sm">
            Alle theaters
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid grid-3">
          {theatres.map((theatre, i) => (
            <Link
              to={`/theater/${theatre.id}`}
              key={theatre.id}
              className="card theatre-card animate-in"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="theatre-card-image">
                <div className="theatre-card-overlay">
                  <Theater size={32} />
                </div>
              </div>
              <div className="card-body">
                <h3 className="card-title">{theatre.name}</h3>
                <div className="card-meta">
                  <MapPin size={14} />
                  <span>{theatre.city}, {theatre.province}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      {!user && (
        <section className="cta-section">
          <div className="container cta-content">
            <h2>Klaar om het theater samen te beleven?</h2>
            <p>Maak een gratis account aan en ontdek wie er naar dezelfde voorstellingen gaat.</p>
            <Link to="/registreren" className="btn btn-accent btn-lg">
              Begin Nu — Het is Gratis
              <ArrowRight size={20} />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
