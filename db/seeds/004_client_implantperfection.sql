-- Seed the AEO registry with Implant Perfection (Dr Tony Taunk's dental-implant
-- clinic, Derby + Burton-on-Trent; sister practice Dental Perfection).
-- Lifted from vertical_insights reports/ci_pipeline/config/implantperfection_discovery.yaml
-- (discovery run 4 Oct 2026); competitor set confirmed by Gulliver 4 Oct 2026 —
-- competitors are tracked and reported by name.
-- Idempotent. Requires the backend migration (combined .../002_aeo_schema.sql).

INSERT INTO aeo.client
    (client_id, name, domain, aliases, subject_pattern, vertical, country, engines,
     competitors, prompts, cadence, active, notes)
VALUES (
    'implantperfection',
    'Implant Perfection',
    'implant-perfection.co.uk',
    ARRAY['Implant Perfection','Dental Perfection','Dr Tony Taunk','Tony Taunk'],
    'implant\s?perfection|dental\s?perfection|taunk',
    'dental_implants',
    'GB',
    ARRAY['chatgpt','google_ai'],
    jsonb_build_array(
        jsonb_build_object('name','Bridge Dental & Implant Clinic','pattern','bridge dental|derbydentists','domain','derbydentists.co.uk'),
        jsonb_build_object('name','The Park Dental Clinic','pattern','park dental','domain','theparkdentalclinic.co.uk'),
        jsonb_build_object('name','Darren Bywater Dental Implant Centre','pattern','bywater','domain','darrenbywater.co.uk'),
        jsonb_build_object('name','Casa Dental','pattern','casa\s?dental','domain','casadental.co.uk'),
        jsonb_build_object('name','SG Dental and Implant Centre','pattern','\bsg\s?dental','domain','sgdental.co.uk'),
        jsonb_build_object('name','Beaufort Dental Health Centre','pattern','beaufort\s?dental','domain','beaufortdentalhealthcentre.co.uk'),
        jsonb_build_object('name','Ashbourne Road Dental','pattern','ashbourne\s?road','domain','ashbourneroaddental.co.uk'),
        jsonb_build_object('name','Hughes and Owen','pattern','hughes.{0,5}owen','domain',''),
        jsonb_build_object('name','Nottingham Implants','pattern','nottingham\s?implants','domain','')
    ),
    jsonb_build_array(
        jsonb_build_object('text','Best dental implant clinic in Derby','branded',false),
        jsonb_build_object('text','Best implant dentist in Burton upon Trent','branded',false),
        jsonb_build_object('text','All-on-4 dental implants Derby','branded',false),
        jsonb_build_object('text','How much do dental implants cost in Derby','branded',false),
        jsonb_build_object('text','Where can I get a single tooth implant near Derby','branded',false),
        jsonb_build_object('text','Dental implants or dentures — which is better','branded',false),
        jsonb_build_object('text','Best dental implant clinic in the East Midlands','branded',false),
        jsonb_build_object('text','Implant Perfection Derby reviews','branded',true)
    ),
    'weekly',
    true,
    'Dr Tony Taunk, Derby (Littleover) + Burton. Named 9/16 AI answers (discovery 4 Oct 2026) but ChatGPT picks Bridge Dental for Derby, SG Dental for Burton. #2 organic for "dental implants derby".'
)
ON CONFLICT (client_id) DO UPDATE SET
    name=EXCLUDED.name, domain=EXCLUDED.domain, aliases=EXCLUDED.aliases,
    subject_pattern=EXCLUDED.subject_pattern, vertical=EXCLUDED.vertical, country=EXCLUDED.country,
    engines=EXCLUDED.engines, competitors=EXCLUDED.competitors, prompts=EXCLUDED.prompts,
    cadence=EXCLUDED.cadence, active=EXCLUDED.active, notes=EXCLUDED.notes, updated_at=now();
