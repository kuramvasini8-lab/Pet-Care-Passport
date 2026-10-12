/**
 * Adoption, Rehoming, Enquiries & Applications Routes
 * Serves both Public Adopter Experience and Pet Owner Rehoming Modules.
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { sendTransactionalEmail } = require('../services/emailService');

// ============================================================================
// A. PUBLIC ADOPTION BROWSING & DETAILS (No login required)
// ============================================================================

// 1. Browse Approved, Active Adoption Listings
router.get('/public/listings', async (req, res) => {
  try {
    const {
      species,
      breed,
      sex,
      location,
      search,
      page = 1,
      limit = 9
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = " WHERE l.status = 'approved' AND p.is_archived = false ";
    const params = [];

    if (species && species.trim() !== '') {
      whereClause += ' AND p.species = ? ';
      params.push(species.trim());
    }

    if (breed && breed.trim() !== '') {
      whereClause += ' AND p.breed LIKE ? ';
      params.push(`%${breed.trim()}%`);
    }

    if (sex && sex.trim() !== '') {
      whereClause += ' AND p.sex = ? ';
      params.push(sex.trim());
    }

    if (location && location.trim() !== '') {
      whereClause += ' AND l.general_location LIKE ? ';
      params.push(`%${location.trim()}%`);
    }

    if (search && search.trim() !== '') {
      whereClause += ' AND (p.name LIKE ? OR l.title LIKE ? OR l.description LIKE ?) ';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    // Count total matching records
    const [countResult] = await query(
      `SELECT COUNT(*) as total
       FROM adoption_listings l
       JOIN pets p ON l.pet_id = p.id
       ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Fetch paginated listings
    const fetchParams = [...params, parseInt(limit, 10), offset];
    const [listings] = await query(
      `SELECT l.id, l.title, l.description, l.general_location, l.status, l.created_at,
              p.id as pet_id, p.name as pet_name, p.species, p.breed, p.dob_or_age,
              p.sex, p.photo_url, p.is_sterilized
       FROM adoption_listings l
       JOIN pets p ON l.pet_id = p.id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      fetchParams
    );

    res.json({
      success: true,
      listings,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error('[AdoptionRoutes] Browse error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve adoption listings.' });
  }
});

// 2. View Single Public Adoption Listing
router.get('/public/listings/:id', async (req, res) => {
  try {
    const listingId = req.params.id;

    const [rows] = await query(
      `SELECT l.id, l.title, l.description, l.temperament, l.health_summary,
              l.adoption_requirements, l.general_location, l.status, l.created_at,
              p.name as pet_name, p.species, p.breed, p.dob_or_age, p.sex,
              p.color_marks, p.photo_url, p.is_sterilized, p.allergies,
              u.full_name as owner_display_name
       FROM adoption_listings l
       JOIN pets p ON l.pet_id = p.id
       JOIN users u ON l.user_id = u.id
       WHERE l.id = ? AND l.status = 'approved'`,
      [listingId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Adoption listing not found or not currently available.'
      });
    }

    res.json({
      success: true,
      listing: rows[0],
      disclaimer: 'Owner-provided description. Approval by PetCare Passport indicates listing policy adherence but does not constitute an independent veterinary endorsement.'
    });
  } catch (error) {
    console.error('[AdoptionRoutes] Listing details error:', error);
    res.status(500).json({ success: false, error: 'Failed to load adoption listing.' });
  }
});

// 3. Submit Adoption Enquiry (Public / Visitor)
router.post('/public/listings/:id/enquiry', async (req, res) => {
  try {
    const listingId = req.params.id;
    const { name, email, phone, message, household_info, consent } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email, and message are required.' });
    }

    if (!consent) {
      return res.status(400).json({ success: false, error: 'You must consent to sharing your enquiry message with the pet owner.' });
    }

    // Verify listing exists and is approved
    const [listings] = await query(
      `SELECT l.id, l.title, u.id as owner_id, u.email as owner_email, p.name as pet_name
       FROM adoption_listings l
       JOIN users u ON l.user_id = u.id
       JOIN pets p ON l.pet_id = p.id
       WHERE l.id = ? AND l.status = 'approved'`,
      [listingId]
    );

    if (listings.length === 0) {
      return res.status(404).json({ success: false, error: 'Listing not found or no longer active.' });
    }

    const listing = listings[0];
    const loggedInUserId = req.session?.user?.id || null;

    // Save enquiry to database
    const [result] = await query(
      `INSERT INTO adoption_enquiries (
        listing_id, user_id, inquirer_name, inquirer_email,
        inquirer_phone, message, household_info, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`,
      [
        listingId,
        loggedInUserId,
        name.trim(),
        email.trim().toLowerCase(),
        phone ? phone.trim() : null,
        message.trim(),
        household_info ? household_info.trim() : null
      ]
    );

    // Notify pet owner in-app
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'New Adoption Enquiry for ${listing.pet_name}', ?, 'enquiry', '/owner/rehoming.html')`,
      [listing.owner_id, `${name.trim()} submitted an enquiry regarding ${listing.pet_name}: "${message.trim().slice(0, 80)}..."`]
    );

    // Send email notification to owner
    await sendTransactionalEmail({
      to: listing.owner_email,
      subject: `New Adoption Enquiry for ${listing.pet_name}`,
      text: `Hello! You have received a new adoption enquiry from ${name} (${email}) regarding ${listing.pet_name}.\n\nMessage: ${message}`,
      html: `<div style="font-family:sans-serif;padding:16px;">
        <h2>🐾 New Adoption Enquiry for ${listing.pet_name}</h2>
        <p><strong>From:</strong> ${name} (&lt;${email}&gt;)</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="background:#f3f4f6;padding:12px;border-left:4px solid #0284c7;">${message}</blockquote>
        <p><a href="http://localhost:3000/owner/rehoming.html" style="background:#0284c7;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;">View Enquiry in Dashboard</a></p>
      </div>`,
      referenceType: 'email_notification',
      referenceId: result.insertId
    });

    res.status(201).json({
      success: true,
      message: 'Your enquiry has been successfully delivered to the listing owner.'
    });
  } catch (error) {
    console.error('[AdoptionRoutes] Enquiry error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit adoption enquiry.' });
  }
});

// ============================================================================
// B. FORMAL ADOPTION APPLICATIONS & FAVOURITES (Registered Users)
// ============================================================================

// 4. Submit Formal Adoption Application
router.post('/listings/:id/apply', requireAuth, async (req, res) => {
  try {
    const listingId = req.params.id;
    const applicantId = req.session.user.id;

    const {
      household_type,
      owns_other_pets,
      has_yard,
      experience_description,
      reference_contact,
      notes
    } = req.body;

    if (!household_type) {
      return res.status(400).json({ success: false, error: 'Household description is required.' });
    }

    // Check if listing is active and approved
    const [listings] = await query(
      `SELECT l.id, l.user_id as owner_id, p.name as pet_name
       FROM adoption_listings l
       JOIN pets p ON l.pet_id = p.id
       WHERE l.id = ? AND l.status = 'approved'`,
      [listingId]
    );

    if (listings.length === 0) {
      return res.status(404).json({ success: false, error: 'Listing not available for application.' });
    }

    if (listings[0].owner_id === applicantId) {
      return res.status(400).json({ success: false, error: 'You cannot apply to adopt your own listed pet.' });
    }

    // Check if applicant already applied
    const [existing] = await query(
      'SELECT id, status FROM adoption_applications WHERE listing_id = ? AND applicant_id = ?',
      [listingId, applicantId]
    );

    if (existing.length > 0 && existing[0].status !== 'withdrawn') {
      return res.status(409).json({
        success: false,
        error: `You already have an active application for this pet (Status: ${existing[0].status}).`
      });
    }

    const [result] = await query(
      `INSERT INTO adoption_applications (
        listing_id, applicant_id, household_type, owns_other_pets,
        has_yard, experience_description, reference_contact, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
      [
        listingId,
        applicantId,
        household_type.trim(),
        owns_other_pets === true || owns_other_pets === 'true',
        has_yard === true || has_yard === 'true',
        experience_description ? experience_description.trim() : null,
        reference_contact ? reference_contact.trim() : null,
        notes ? notes.trim() : null
      ]
    );

    // Notify pet owner in-app
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'New Adoption Application for ${listings[0].pet_name}', ?, 'application', '/owner/rehoming.html')`,
      [listings[0].owner_id, `${req.session.user.full_name} submitted a formal adoption application for ${listings[0].pet_name}.`]
    );

    res.status(201).json({
      success: true,
      message: 'Adoption application submitted successfully! You can track its status in your dashboard.',
      application_id: result.insertId
    });
  } catch (error) {
    console.error('[AdoptionRoutes] Apply error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit adoption application.' });
  }
});

// 5. Track My Submitted Applications (Adopter Experience)
router.get('/adopter/applications', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [applications] = await query(
      `SELECT a.*, l.title as listing_title, l.general_location,
              p.name as pet_name, p.species, p.breed, p.photo_url as pet_photo
       FROM adoption_applications a
       JOIN adoption_listings l ON a.listing_id = l.id
       JOIN pets p ON l.pet_id = p.id
       WHERE a.applicant_id = ?
       ORDER BY a.created_at DESC`,
      [userId]
    );

    res.json({ success: true, applications });
  } catch (error) {
    console.error('[AdoptionRoutes] My applications error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve applications.' });
  }
});

// 6. Withdraw Adoption Application
router.put('/adopter/applications/:id/withdraw', requireAuth, async (req, res) => {
  try {
    const appId = req.params.id;
    const userId = req.session.user.id;

    const [existing] = await query(
      'SELECT id, status FROM adoption_applications WHERE id = ? AND applicant_id = ?',
      [appId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found or unauthorized.' });
    }

    if (existing[0].status === 'accepted') {
      return res.status(400).json({ success: false, error: 'Cannot withdraw an accepted application.' });
    }

    await query('UPDATE adoption_applications SET status = "withdrawn" WHERE id = ?', [appId]);

    res.json({ success: true, message: 'Application withdrawn.' });
  } catch (error) {
    console.error('[AdoptionRoutes] Withdraw error:', error);
    res.status(500).json({ success: false, error: 'Failed to withdraw application.' });
  }
});

// 7. Track My Enquiries (Adopter Experience)
router.get('/adopter/enquiries', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [enquiries] = await query(
      `SELECT e.*, l.title as listing_title, p.name as pet_name, p.photo_url as pet_photo
       FROM adoption_enquiries e
       JOIN adoption_listings l ON e.listing_id = l.id
       JOIN pets p ON l.pet_id = p.id
       WHERE e.user_id = ?
       ORDER BY e.created_at DESC`,
      [userId]
    );

    res.json({ success: true, enquiries });
  } catch (error) {
    console.error('[AdoptionRoutes] My enquiries error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve enquiries.' });
  }
});

// 8. Favourites: Toggle & View (Registered Users)
router.get('/adopter/favourites', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [favourites] = await query(
      `SELECT f.id as fav_id, f.created_at as saved_at,
              l.id as listing_id, l.title, l.general_location, l.status,
              p.name as pet_name, p.species, p.breed, p.dob_or_age, p.sex, p.photo_url
       FROM favourites f
       JOIN adoption_listings l ON f.listing_id = l.id
       JOIN pets p ON l.pet_id = p.id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [userId]
    );

    res.json({ success: true, favourites });
  } catch (error) {
    console.error('[AdoptionRoutes] Favourites error:', error);
    res.status(500).json({ success: false, error: 'Failed to load saved pets.' });
  }
});

router.post('/listings/:id/favourite', requireAuth, async (req, res) => {
  try {
    const listingId = req.params.id;
    const userId = req.session.user.id;

    const [existing] = await query(
      'SELECT id FROM favourites WHERE user_id = ? AND listing_id = ?',
      [userId, listingId]
    );

    if (existing.length > 0) {
      await query('DELETE FROM favourites WHERE id = ?', [existing[0].id]);
      return res.json({ success: true, is_favourite: false, message: 'Removed from saved pets.' });
    } else {
      await query('INSERT INTO favourites (user_id, listing_id) VALUES (?, ?)', [userId, listingId]);
      return res.json({ success: true, is_favourite: true, message: 'Added to saved pets! ❤️' });
    }
  } catch (error) {
    console.error('[AdoptionRoutes] Toggle favourite error:', error);
    res.status(500).json({ success: false, error: 'Failed to update favourite.' });
  }
});

// ============================================================================
// C. PET OWNER REHOMING MODULE (Pet Owner Dashboard)
// ============================================================================

// 9. List Owner's Adoption Listings
router.get('/owner/listings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [listings] = await query(
      `SELECT l.*, p.name as pet_name, p.species, p.breed, p.photo_url as pet_photo,
              (SELECT COUNT(*) FROM adoption_enquiries WHERE listing_id = l.id) as enquiry_count,
              (SELECT COUNT(*) FROM adoption_applications WHERE listing_id = l.id) as application_count
       FROM adoption_listings l
       JOIN pets p ON l.pet_id = p.id
       WHERE l.user_id = ?
       ORDER BY l.created_at DESC`,
      [userId]
    );

    res.json({ success: true, listings });
  } catch (error) {
    console.error('[AdoptionRoutes] Owner listings error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve your rehoming listings.' });
  }
});

// 10. Create New Rehoming Listing (Owner)
router.post('/owner/listings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const {
      pet_id,
      title,
      description,
      temperament,
      health_summary,
      adoption_requirements,
      general_location
    } = req.body;

    if (!pet_id || !title || !description || !general_location) {
      return res.status(400).json({ success: false, error: 'Pet, title, description, and general location are required.' });
    }

    // Verify ownership
    const [pets] = await query('SELECT id, name FROM pets WHERE id = ? AND user_id = ?', [pet_id, userId]);
    if (pets.length === 0) {
      return res.status(404).json({ success: false, error: 'Pet not found or unauthorized.' });
    }

    // New listings ALWAYS start in pending_approval! (Cannot approve own listings)
    const [result] = await query(
      `INSERT INTO adoption_listings (
        pet_id, user_id, title, description, temperament,
        health_summary, adoption_requirements, general_location, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval')`,
      [
        pet_id,
        userId,
        title.trim(),
        description.trim(),
        temperament ? temperament.trim() : null,
        health_summary ? health_summary.trim() : null,
        adoption_requirements ? adoption_requirements.trim() : null,
        general_location.trim()
      ]
    );

    // Notify user
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'Adoption Listing Submitted', 'Your listing for "${pets[0].name}" has been submitted for administrator moderation.', 'moderation', '/owner/rehoming.html')`,
      [userId]
    );

    res.status(201).json({
      success: true,
      message: 'Adoption listing submitted for review! It will be published once approved by an administrator.',
      listing_id: result.insertId
    });
  } catch (error) {
    console.error('[AdoptionRoutes] Create listing error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit adoption listing.' });
  }
});

// 11. Update Rehoming Listing (Owner editing or responding to changes requested)
router.put('/owner/listings/:id', requireAuth, async (req, res) => {
  try {
    const listingId = req.params.id;
    const userId = req.session.user.id;

    const [existing] = await query(
      'SELECT * FROM adoption_listings WHERE id = ? AND user_id = ?',
      [listingId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Listing not found or unauthorized.' });
    }

    const {
      title,
      description,
      temperament,
      health_summary,
      adoption_requirements,
      general_location,
      resubmit_for_review
    } = req.body;

    // If changes were requested, owner can resubmit for review
    let newStatus = existing[0].status;
    if (resubmit_for_review || existing[0].status === 'changes_requested') {
      newStatus = 'pending_approval';
    }

    await query(
      `UPDATE adoption_listings SET
        title = ?, description = ?, temperament = ?,
        health_summary = ?, adoption_requirements = ?, general_location = ?,
        status = ?
       WHERE id = ?`,
      [
        title ? title.trim() : existing[0].title,
        description ? description.trim() : existing[0].description,
        temperament ? temperament.trim() : existing[0].temperament,
        health_summary ? health_summary.trim() : existing[0].health_summary,
        adoption_requirements ? adoption_requirements.trim() : existing[0].adoption_requirements,
        general_location ? general_location.trim() : existing[0].general_location,
        newStatus,
        listingId
      ]
    );

    res.json({
      success: true,
      message: newStatus === 'pending_approval'
        ? 'Listing updated and resubmitted for administrator approval!'
        : 'Listing updated successfully.',
      status: newStatus
    });
  } catch (error) {
    console.error('[AdoptionRoutes] Update owner listing error:', error);
    res.status(500).json({ success: false, error: 'Failed to update adoption listing.' });
  }
});

// 12. Mark Listing Adopted or Closed (Owner)
router.put('/owner/listings/:id/status', requireAuth, async (req, res) => {
  try {
    const listingId = req.params.id;
    const userId = req.session.user.id;
    const { status } = req.body;

    if (!['adopted', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Permitted status values: adopted or closed.' });
    }

    const [result] = await query(
      'UPDATE adoption_listings SET status = ? WHERE id = ? AND user_id = ?',
      [status, listingId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Listing not found or unauthorized.' });
    }

    res.json({ success: true, message: `Listing marked as ${status}.` });
  } catch (error) {
    console.error('[AdoptionRoutes] Owner status change error:', error);
    res.status(500).json({ success: false, error: 'Failed to change listing status.' });
  }
});

// 13. View Enquiries & Applications for Owner Listing
router.get('/owner/listings/:id/enquiries', requireAuth, async (req, res) => {
  try {
    const listingId = req.params.id;
    const userId = req.session.user.id;

    // Verify ownership
    const [existing] = await query(
      'SELECT id FROM adoption_listings WHERE id = ? AND user_id = ?',
      [listingId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Listing not found or unauthorized.' });
    }

    const [enquiries] = await query(
      'SELECT * FROM adoption_enquiries WHERE listing_id = ? ORDER BY created_at DESC',
      [listingId]
    );

    const [applications] = await query(
      `SELECT a.*, u.full_name as applicant_name, u.email as applicant_email, u.phone as applicant_phone
       FROM adoption_applications a
       JOIN users u ON a.applicant_id = u.id
       WHERE a.listing_id = ?
       ORDER BY a.created_at DESC`,
      [listingId]
    );

    res.json({ success: true, enquiries, applications });
  } catch (error) {
    console.error('[AdoptionRoutes] View listing enquiries error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve enquiries and applications.' });
  }
});

// 14. Owner Review Application: Update Application Status
router.put('/owner/applications/:id/status', requireAuth, async (req, res) => {
  try {
    const appId = req.params.id;
    const userId = req.session.user.id;
    const { status, status_reason } = req.body;

    const validStatuses = ['under_review', 'more_info_requested', 'accepted', 'declined'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid application status.' });
    }

    // Verify owner owns the listing associated with this application
    const [app] = await query(
      `SELECT a.*, l.user_id as owner_id, p.name as pet_name, a.applicant_id
       FROM adoption_applications a
       JOIN adoption_listings l ON a.listing_id = l.id
       JOIN pets p ON l.pet_id = p.id
       WHERE a.id = ?`,
      [appId]
    );

    if (app.length === 0 || app[0].owner_id !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized to review this application.' });
    }

    await query(
      'UPDATE adoption_applications SET status = ?, status_reason = ? WHERE id = ?',
      [status, status_reason ? status_reason.trim() : null, appId]
    );

    // Notify applicant
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES (?, 'Application Status Update: ${app[0].pet_name}', ?, 'application', '/adopter/applications.html')`,
      [app[0].applicant_id, `Your adoption application status for ${app[0].pet_name} has been updated to: ${status.toUpperCase().replace('_', ' ')}.`]
    );

    res.json({
      success: true,
      message: `Application status updated to ${status}. Note: Acceptance does not transfer ownership or private health records without separate explicit transfer authorization.`
    });
  } catch (error) {
    console.error('[AdoptionRoutes] Update application status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update application status.' });
  }
});

module.exports = router;
