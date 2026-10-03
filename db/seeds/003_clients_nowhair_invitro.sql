-- Seed the AEO registry with NOW Hair (UK hair transplant) and InVitro (Spanish
-- plant micropropagation / Paulownia), the latter as two rows — Spain and France —
-- because aeo.client is one country per row and the scrape is geo-targeted.
-- Lifted from vertical_insights reports/ci_pipeline/config/nowhair_discovery.yaml,
-- invitro_discovery.yaml and invitro_discovery_fr.yaml (discovery runs 3 Oct 2026);
-- competitor sets confirmed by Gulliver 3 Oct 2026.
-- Idempotent. Requires the backend migration (combined .../002_aeo_schema.sql).

INSERT INTO aeo.client
    (client_id, name, domain, aliases, subject_pattern, vertical, country, engines,
     competitors, prompts, cadence, active, notes)
VALUES
(
    'nowhair',
    'NOW Hair',
    'nowhair.co.uk',
    ARRAY['NOW Hair','NOW Hair Transplant','NOW Cosmetic Surgery','nowhair'],
    'now\s?hair|now\s?cosmetic',
    'hair_transplant',
    'GB',
    ARRAY['chatgpt','google_ai'],
    jsonb_build_array(
        jsonb_build_object('name','Farjo Hair Institute','pattern','farjo','domain','farjo.com'),
        jsonb_build_object('name','Wimpole Clinic','pattern','wimpole','domain','wimpole.com'),
        jsonb_build_object('name','KSL Clinic','pattern','\bksl\b','domain','kslclinic.co.uk'),
        jsonb_build_object('name','Capital Hair Restoration','pattern','capital\s?hair','domain','capitalhairrestoration.co.uk'),
        jsonb_build_object('name','Harley Street Hair Transplant','pattern','harley\s?street\s?hair\s?transplant','domain','harleystreethairtransplant.co.uk'),
        jsonb_build_object('name','WMG London','pattern','\bwmg\b|westminster\s?medical','domain','wmglondon.com'),
        jsonb_build_object('name','Fortes Clinic','pattern','fortes\s?clinic','domain',''),
        jsonb_build_object('name','The Maitland Clinic','pattern','maitland','domain',''),
        jsonb_build_object('name','Berkeley Hair Clinic','pattern','berkeley\s?hair','domain',''),
        jsonb_build_object('name','Este Medical','pattern','este\s?medical|este\s?clinic','domain',''),
        jsonb_build_object('name','Vinci Hair Clinic','pattern','vinci\s?hair','domain','')
    ),
    jsonb_build_array(
        jsonb_build_object('text','Best hair transplant clinic in the UK','branded',false),
        jsonb_build_object('text','Where to get a hair transplant in London','branded',false),
        jsonb_build_object('text','Best hair transplant clinic in Manchester','branded',false),
        jsonb_build_object('text','FUE hair transplant best clinic UK','branded',false),
        jsonb_build_object('text','Hair transplant cost UK','branded',false),
        jsonb_build_object('text','Best female hair transplant clinic UK','branded',false),
        jsonb_build_object('text','Most reputable hair transplant surgeons UK','branded',false),
        jsonb_build_object('text','Is it better to get a hair transplant in Turkey or the UK','branded',false),
        jsonb_build_object('text','NOW Hair reviews','branded',true)
    ),
    'weekly',
    true,
    'NOW Cosmetic Surgery''s hair brand, London + Manchester. Near-invisible: named 2/16 AI answers (branded only), absent from Google top 10. nowcosmeticsurgery.com is the parent site (also watched).'
),
(
    'invitro_es',
    'InVitro',
    'invitro.es',
    ARRAY['InVitro','In Vitro SL','IN VITRO SL','Clon InVitro 112','InVitro 112'],
    'in\s?vitro\s?(sl|s\.l\.|112)|clon in\s?vitro|invitro\.es',
    'plant_micropropagation',
    'ES',
    ARRAY['chatgpt','google_ai'],
    jsonb_build_array(
        jsonb_build_object('name','iPaulownia / Cotevisa','pattern','ipaulownia|cotevisa','domain','ipaulownia.com'),
        jsonb_build_object('name','Paulownia Professional','pattern','paulownia\s?professional|paulownia\.pro','domain','paulownia.pro'),
        jsonb_build_object('name','Paulownia Energy','pattern','paulownia\s?energy|paulownia\.energy','domain','paulownia.energy'),
        jsonb_build_object('name','Meristec','pattern','meristec','domain','meristec.es'),
        jsonb_build_object('name','Cultigar','pattern','cultigar','domain','cultigar.es'),
        jsonb_build_object('name','Paulownia Europa','pattern','paulownia\s?europa','domain','')
    ),
    jsonb_build_array(
        jsonb_build_object('text','Mejor proveedor de plantas de Paulownia en España','branded',false),
        jsonb_build_object('text','Dónde comprar plantas de Paulownia para plantación','branded',false),
        jsonb_build_object('text','Laboratorio de micropropagación de plantas en España','branded',false),
        jsonb_build_object('text','Empresas de cultivo in vitro de plantas en España','branded',false),
        jsonb_build_object('text','Best Paulownia clone for timber plantation','branded',false),
        jsonb_build_object('text','Paulownia plant supplier Europe','branded',false),
        jsonb_build_object('text','Plant tissue culture laboratory Europe for nurseries','branded',false),
        jsonb_build_object('text','Is Paulownia a good investment for a plantation','branded',false),
        jsonb_build_object('text','Paulownia Clon InVitro 112 opiniones','branded',true)
    ),
    'weekly',
    true,
    'IN VITRO SL, Sant Feliu de Llobregat. Spain market. Strong in AI answers (named 10/17 geo-targeted) but absent from Spanish Google results. Oxytree markets the In Vitro 112 clone (partner, not tracked).'
),
(
    'invitro_fr',
    'InVitro',
    'invitro.es',
    ARRAY['InVitro','In Vitro SL','IN VITRO SL','Clon InVitro 112','InVitro 112'],
    'in\s?vitro\s?(sl|s\.l\.|112)|clon in\s?vitro|invitro\.es',
    'plant_micropropagation',
    'FR',
    ARRAY['chatgpt','google_ai'],
    jsonb_build_array(
        jsonb_build_object('name','Paulownia Energy','pattern','paulownia\s?energy|paulownia\.energy','domain','paulownia.energy'),
        jsonb_build_object('name','Paulownia Nature','pattern','paulownia\s?nature','domain','paulownia-nature.fr'),
        jsonb_build_object('name','Paulownia France','pattern','paulownia\s?france|marcellus','domain','paulowniafrance.com'),
        jsonb_build_object('name','Vitropic','pattern','vitropic','domain','vitropic.fr'),
        jsonb_build_object('name','iPaulownia / Cotevisa','pattern','ipaulownia|cotevisa','domain','ipaulownia.com')
    ),
    jsonb_build_array(
        jsonb_build_object('text','Meilleur fournisseur de plants de Paulownia en France','branded',false),
        jsonb_build_object('text','Où acheter des plants de Paulownia pour une plantation','branded',false),
        jsonb_build_object('text','Pépinière Paulownia en France','branded',false),
        jsonb_build_object('text','Meilleur clone de Paulownia pour le bois d''œuvre','branded',false),
        jsonb_build_object('text','La Paulownia est-elle un bon investissement pour une plantation','branded',false),
        jsonb_build_object('text','Laboratoire de micropropagation de plantes en France','branded',false),
        jsonb_build_object('text','Fournisseur de plants in vitro pour pépinières en Europe','branded',false),
        jsonb_build_object('text','Paulownia Clon InVitro 112 avis','branded',true)
    ),
    'weekly',
    true,
    'InVitro, France market (same company as invitro_es). Paulownia Energy dominates FR AI answers + Google; InVitro named 3/15.'
)
ON CONFLICT (client_id) DO UPDATE SET
    name=EXCLUDED.name, domain=EXCLUDED.domain, aliases=EXCLUDED.aliases,
    subject_pattern=EXCLUDED.subject_pattern, vertical=EXCLUDED.vertical, country=EXCLUDED.country,
    engines=EXCLUDED.engines, competitors=EXCLUDED.competitors, prompts=EXCLUDED.prompts,
    cadence=EXCLUDED.cadence, active=EXCLUDED.active, notes=EXCLUDED.notes, updated_at=now();
