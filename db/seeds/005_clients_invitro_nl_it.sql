-- InVitro Netherlands + Italy markets (aeo.client is one country per row, and the
-- scrape is geo-targeted by `country`). Prompts from vertical_insights
-- reports/ci_pipeline/config/invitro_discovery_{nl,it}.yaml; competitor sets from
-- those discovery runs (4 Oct 2026), confirmed by Gulliver.
-- Idempotent. Requires the backend migration (combined .../002_aeo_schema.sql).

INSERT INTO aeo.client
    (client_id, name, domain, aliases, subject_pattern, vertical, country, engines,
     competitors, prompts, cadence, active, notes)
VALUES
(
    'invitro_nl', 'InVitro', 'invitro.es',
    ARRAY['InVitro','In Vitro SL','IN VITRO SL','Clon InVitro 112','InVitro 112'],
    'in\s?vitro\s?(sl|s\.l\.|112)|clon in\s?vitro|invitro\.es', 'plant_micropropagation', 'NL',
    ARRAY['chatgpt','google_ai'],
    jsonb_build_array(
        jsonb_build_object('name','Paulownia Cultures','pattern','paulownia\s?cultures','domain','paulownia-cultures.eu'),
        jsonb_build_object('name','Paulownia Holland','pattern','paulownia\s?holland','domain','paulowniaholland.nl'),
        jsonb_build_object('name','Paulownia Project','pattern','paulownia\s?project','domain','paulowniaproject.nl'),
        jsonb_build_object('name','Paulownia Energy','pattern','paulownia\s?energy|paulownia\.energy','domain','paulownia.energy'),
        jsonb_build_object('name','iPaulownia / Cotevisa','pattern','ipaulownia|cotevisa','domain','ipaulownia.com'),
        jsonb_build_object('name','Oxytree','pattern','oxytree','domain','')
    ),
    jsonb_build_array(
        jsonb_build_object('text','Beste leverancier van Paulownia bomen in Nederland','branded',false),
        jsonb_build_object('text','Waar koop ik Paulownia bomen voor een plantage','branded',false),
        jsonb_build_object('text','Paulownia boom kopen','branded',false),
        jsonb_build_object('text','Beste Paulownia kloon voor houtproductie','branded',false),
        jsonb_build_object('text','Is Paulownia een goede investering','branded',false),
        jsonb_build_object('text','Kwekerij Paulownia Nederland','branded',false),
        jsonb_build_object('text','Leverancier van in vitro planten voor kwekerijen in Europa','branded',false),
        jsonb_build_object('text','Paulownia Clon InVitro 112 ervaringen','branded',true)
    ),
    'weekly', true,
    'InVitro, Netherlands market. Small specialist field (discovery 4 Oct 2026): paulownia-cultures.eu, paulowniaholland.nl, paulowniaproject.nl; InVitro named 3/14. InVitro runs Google Ads here (paulownia boom kopen, anna paulownaboom kopen convert).'
),
(
    'invitro_it', 'InVitro', 'invitro.es',
    ARRAY['InVitro','In Vitro SL','IN VITRO SL','Clon InVitro 112','InVitro 112'],
    'in\s?vitro\s?(sl|s\.l\.|112)|clon in\s?vitro|invitro\.es', 'plant_micropropagation', 'IT',
    ARRAY['chatgpt','google_ai'],
    jsonb_build_array(
        jsonb_build_object('name','Paulownia Energy','pattern','paulownia\s?energy|paulownia\.energy','domain','paulownia.energy'),
        jsonb_build_object('name','Vivaio di Castelletto','pattern','castelletto','domain','vivaiodicastelletto.it'),
        jsonb_build_object('name','Sassi Garden','pattern','sassi\s?garden','domain','sassigarden.com'),
        jsonb_build_object('name','Wonderkgreen','pattern','wonderk','domain','wonderkgreen.it'),
        jsonb_build_object('name','iPaulownia / Cotevisa','pattern','ipaulownia|cotevisa','domain','ipaulownia.com'),
        jsonb_build_object('name','Oxytree','pattern','oxytree','domain','')
    ),
    jsonb_build_array(
        jsonb_build_object('text','Miglior fornitore di piante di Paulownia in Italia','branded',false),
        jsonb_build_object('text','Dove comprare piante di Paulownia per una piantagione','branded',false),
        jsonb_build_object('text','Piantine di Paulownia prezzo','branded',false),
        jsonb_build_object('text','Miglior clone di Paulownia per legname','branded',false),
        jsonb_build_object('text','La Paulownia è un buon investimento','branded',false),
        jsonb_build_object('text','Vivaio Paulownia Italia','branded',false),
        jsonb_build_object('text','Laboratorio di micropropagazione di piante in Italia','branded',false),
        jsonb_build_object('text','Paulownia Clon InVitro 112 opinioni','branded',true)
    ),
    'weekly', true,
    'InVitro, Italy market. Paulownia Energy dominates (8/15 AI answers, discovery 4 Oct 2026); nurseries Vivaio di Castelletto, Sassi Garden, Wonderkgreen. InVitro named 3/15. InVitro runs Google Ads here (paulownia prezzo, piantine di paulownia).'
)
ON CONFLICT (client_id) DO UPDATE SET
    name=EXCLUDED.name, domain=EXCLUDED.domain, aliases=EXCLUDED.aliases,
    subject_pattern=EXCLUDED.subject_pattern, vertical=EXCLUDED.vertical, country=EXCLUDED.country,
    engines=EXCLUDED.engines, competitors=EXCLUDED.competitors, prompts=EXCLUDED.prompts,
    cadence=EXCLUDED.cadence, active=EXCLUDED.active, notes=EXCLUDED.notes, updated_at=now();
