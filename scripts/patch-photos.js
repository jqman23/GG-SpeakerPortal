// Run with: node --env-file=.env.local scripts/patch-photos.js
// Patches Cvent CDN photo URLs for Skill Building Institute speakers into the DB.
// Source: SKILL_SPEAKER_OVERRIDE from GG-AgendaSkeleton-widget/build_sessions.js
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const CDN = 'https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/';

// Keyed by "First Last" display name → photo URL (null = no photo available yet)
// Aliases (non-accented / shortened CSV variants) map to the same photo as the canonical name.
const PHOTOS = {
  'Paul Nixon':       CDN + 'c85b4588d3f04f03af1ff97dcf7c5214.png',
  'Sharon Inglis':    CDN + 'fb537cda9e16421abe5e3946c5057638.jpg',
  'Jess Hoeper':      CDN + '5accc76ba6ec49db8182e06fc9c81347.png',
  'Brëanna McMullen': CDN + '5accc76ba6ec49db8182e06fc9c81347.png',
  'Bre McMullen':     CDN + '5accc76ba6ec49db8182e06fc9c81347.png',
  'Mark Durgin':      CDN + '1911c1220e974a53a533087beb213e95.png',
  'Ellen Kagen':      CDN + 'a9768e31b09a4054839a72b5dbce699d.png',
  'Barb Putnam':      CDN + '92a9464813d54b3189fc61fa94b2ff0e.jpg',
  'Valerie Frost':    CDN + '606d3b0edcdc4e16a02afda9d4ea3e23.jpg',
  'Michelle Mares':   CDN + 'a3e21ea156c249bbbb07aab7866420c5.jpg',
  'Jude Louissaint':  CDN + '08aa9a7aa0094bfeb36a4a41be2f5617.jpg',
  'Tracy Malone':     CDN + '1674b55b6c684eda8785ab18030738e1.jpg',
  'Stacey Moss':      CDN + 'a0b234bb70834f66aedb516198806f4b.jpg',
  'Liz Wendel':       CDN + '8000a49cebfc454c9fb103b9d946b2c9.jpg',
  'Dan Martin':       CDN + '20efd7dd23744a78b7eeb2f76056a761.png',
  'Colleen Gibley-Reed': CDN + 'f44828c03f9949b4b8725f7f99745154.jpg',
  'Andrew Turnell AM':   CDN + '7464efdc944f405c86ac7cab697ff19c.png',
  'Andrew Turnell':      CDN + '7464efdc944f405c86ac7cab697ff19c.png',
  // Anna Strömberg / Anna Stromberg — no photo available yet (null in source)
};

async function patchPhotos() {
  let updated = 0;
  let notFound = 0;

  for (const [displayName, photoUrl] of Object.entries(PHOTOS)) {
    const [first, ...rest] = displayName.split(' ');
    const last = rest.join(' ');

    // Match by first_name + last_name (case-insensitive, trimmed)
    const rows = await sql`
      SELECT speaker_code, first_name, last_name
      FROM speakers
      WHERE LOWER(TRIM(first_name)) = LOWER(${first})
        AND LOWER(TRIM(last_name))  = LOWER(${last})
    `;

    if (!rows.length) {
      console.warn(`  ⚠ No DB match for "${displayName}"`);
      notFound++;
      continue;
    }

    for (const row of rows) {
      await sql`
        UPDATE speakers SET photo_url = ${photoUrl}
        WHERE speaker_code = ${row.speaker_code}
      `;
      console.log(`  ✓ ${row.first_name} ${row.last_name} (${row.speaker_code})`);
      updated++;
    }
  }

  console.log(`\n✓ Patch complete — ${updated} updated, ${notFound} names not found in DB`);
}

patchPhotos().catch(err => { console.error(err); process.exit(1); });
