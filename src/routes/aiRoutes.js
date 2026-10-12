/**
 * AI Pet-Care Assistant Route
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { generatePetCareResponse } = require('../services/aiService');

router.post('/ask', requireAuth, async (req, res) => {
  try {
    const { prompt, petId, topic } = req.body;
    const userId = req.session.user.id;

    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({ success: false, error: 'A question or prompt is required.' });
    }

    let petContext = null;
    if (petId) {
      const [pets] = await query('SELECT * FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
      if (pets.length > 0) {
        petContext = pets[0];
      }
    }

    const aiResult = await generatePetCareResponse({
      prompt: prompt.trim(),
      petContext,
      topic: topic || 'general'
    });

    res.json({
      success: true,
      answer: aiResult.answer,
      response: aiResult.answer,
      disclaimer: "Clinical Disclaimer: PetCare Passport AI is an educational reference tool only and is not a licensed veterinarian. It cannot diagnose illnesses, interpret medical emergencies, or prescribe medications and dosages.",
      provider: aiResult.provider,
      model: aiResult.model,
      pet: petContext ? { id: petContext.id, name: petContext.name, species: petContext.species } : null
    });
  } catch (error) {
    console.error('[AIRoutes] Query error:', error);
    res.status(500).json({ success: false, error: 'AI Assistant was unable to process your request.' });
  }
});

module.exports = router;
