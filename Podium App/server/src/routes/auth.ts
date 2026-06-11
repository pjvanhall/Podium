const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');
const socialRepository = require('../repositories/socialRepository');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Vul alle verplichte velden in.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Wachtwoord moet minimaal 6 tekens bevatten.' });
    }

    // Check if email already exists
    const existing = await socialRepository.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Dit e-mailadres is al in gebruik.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const userId = await socialRepository.createUser(email, passwordHash, name);

    // Generate token
    const token = jwt.sign(
      { id: userId, email, name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account succesvol aangemaakt!',
      token,
      user: { id: userId, email, name, avatar: '', bio: '', city: '' }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden bij het registreren.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Vul je e-mailadres en wachtwoord in.' });
    }

    // Find user
    const user = await socialRepository.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Onjuist e-mailadres of wachtwoord.' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Onjuist e-mailadres of wachtwoord.' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Succesvol ingelogd!',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        bio: user.bio,
        city: user.city
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden bij het inloggen.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await socialRepository.getUserById(req.user.id, true);

    if (!user) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
