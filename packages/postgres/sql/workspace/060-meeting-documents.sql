-- Derived documentary navigation. No new stored identity or document copy.
CREATE FUNCTION hall.meeting_documentary_context(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT CASE WHEN observation.payload IS NOT NULL THEN jsonb_build_object(
    'source', jsonb_build_object('kind','snapshot','phase',observation.phase,'capturedAt',observation.captured_at),
    'payload',observation.payload)
  ELSE jsonb_build_object('source',jsonb_build_object('kind','current'),'payload',jsonb_build_object(
    'agenda',(SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY abs(item.position),item.id),'[]'::jsonb)
      FROM hall.council_agenda_item item WHERE item.council_meeting=target_meeting AND (item.position>0 OR item.adjourned_at IS NOT NULL)),
    'businesses',(SELECT coalesce(jsonb_agg(to_jsonb(workspace)||jsonb_build_object(
      'resources',(SELECT coalesce(jsonb_agg(to_jsonb(association) ORDER BY association.position),'[]'::jsonb)
        FROM hall.council_business_resource association WHERE association.council_business=workspace.council_business))),'[]'::jsonb)
      FROM hall.council_business_workspace workspace WHERE workspace.council_business IN (
        SELECT council_business FROM hall.council_agenda_item WHERE council_meeting=target_meeting AND (position>0 OR adjourned_at IS NOT NULL))),
    'attendance',(SELECT coalesce(jsonb_agg(to_jsonb(attendance)),'[]'::jsonb) FROM hall.meeting_attendance attendance WHERE council_meeting=target_meeting),
    'conduct',hall.meeting_conduct_evidence(target_meeting))) END
  FROM hall.council_meetings meeting LEFT JOIN LATERAL (
    SELECT * FROM hall.council_meeting_snapshot WHERE council_meeting=target_meeting
    ORDER BY CASE phase WHEN 'closing' THEN 0 ELSE 1 END LIMIT 1
  ) observation ON true WHERE meeting.id=target_meeting;
$$;

CREATE FUNCTION hall.meeting_documentary_resource_relations(context JSONB)
RETURNS TABLE(resource_id UUID, business_id UUID, role TEXT)
LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  WITH businesses AS (SELECT value FROM jsonb_array_elements(context#>'{payload,businesses}')),
  agenda AS (SELECT value FROM jsonb_array_elements(context#>'{payload,agenda}'))
  SELECT (value->>'report_resource')::uuid,(value->>'council_business')::uuid,'report' FROM businesses
  UNION SELECT (association->>'resource')::uuid,(businesses.value->>'council_business')::uuid,'attachment'
    FROM businesses CROSS JOIN LATERAL jsonb_array_elements(businesses.value->'resources') association
  UNION SELECT subject.text_resource,(agenda.value->>'council_business')::uuid,'subject'
    FROM agenda JOIN hall.prepared_council_subject subject ON subject.id=coalesce(
      agenda.value->>'council_decision_proposal',agenda.value->>'open_question')::uuid
  UNION SELECT (value->>'proxy_document')::uuid,NULL::uuid,'proxy'
    FROM jsonb_array_elements(context#>'{payload,attendance}') WHERE value->>'proxy_document' IS NOT NULL
  UNION SELECT (value->>'proxyDocumentId')::uuid,NULL::uuid,'proxy'
    FROM jsonb_array_elements(context#>'{payload,conduct,attendanceEvents}') WHERE value->>'proxyDocumentId' IS NOT NULL;
$$;

-- @implements-requirement HALL-FR-MIN-160
-- Presents a document reference: the current name and location of the
-- resource, with the frozen component state and the binary object recorded by
-- the reference. Bytes are never read here.
CREATE FUNCTION hall.meeting_document_presentation(reference JSONB)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object(
    'resource', hall.resource_detail(resource.id) || coalesce(reference->'frozen', '{}'::jsonb)
      || coalesce((SELECT jsonb_build_object('binary', jsonb_build_object('id', bytes.id, 'mediaType', bytes.media_type,
          'byteSize', bytes.byte_size, 'contentSha256', bytes.content_sha256))
        FROM hall.binary_object bytes WHERE bytes.id = (reference->>'binaryObject')::UUID), '{}'::jsonb),
    'binaryObject', reference->'binaryObject',
    'editorAssets', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', asset.id, 'title', asset.title,
        'mediaType', bytes.media_type, 'binaryObject', bytes.id) ORDER BY asset.id), '[]'::jsonb)
      FROM jsonb_array_elements(reference->'editorAssets') recorded
      JOIN hall.editor_asset asset ON asset.id = (recorded->>'id')::UUID
      JOIN hall.binary_object bytes ON bytes.id = (recorded->>'binaryObject')::UUID))
  FROM hall.resource resource WHERE resource.id = (reference->>'resource')::UUID;
$$;

CREATE FUNCTION hall.meeting_documentary_resource(context JSONB, target_resource UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT hall.meeting_document_presentation(CASE WHEN context#>>'{source,kind}'='snapshot' THEN (
    SELECT value FROM jsonb_array_elements(context#>'{payload,documents}') WHERE value->>'resource'=target_resource::text
  ) ELSE hall.meeting_document_reference(target_resource) END)
  WHERE EXISTS (SELECT FROM hall.meeting_documentary_resource_relations(context) WHERE resource_id=target_resource);
$$;

CREATE FUNCTION hall_api.meeting_documents(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  WITH context AS (SELECT hall.meeting_documentary_context(target_meeting) value),
  relations AS (
    SELECT relation.resource_id,
      to_jsonb(array_agg(DISTINCT relation.role ORDER BY relation.role)) roles,
      to_jsonb(coalesce(array_agg(DISTINCT relation.business_id ORDER BY relation.business_id) FILTER (WHERE relation.business_id IS NOT NULL),'{}'::uuid[])) business_ids,
      bool_or(relation.role='proxy') proxy
    FROM context CROSS JOIN LATERAL hall.meeting_documentary_resource_relations(context.value) relation
    GROUP BY relation.resource_id
  ),
  recorded AS (
    SELECT entry->>'resource' AS id, entry AS reference
    FROM context, jsonb_array_elements(CASE WHEN context.value#>>'{source,kind}'='snapshot'
      THEN context.value#>'{payload,documents}' ELSE '[]'::jsonb END) entry
  ),
  resources AS (
    SELECT jsonb_build_object('id',relations.resource_id,'title',current_resource.name,
      'mediaType',bytes.media_type,
      'source',CASE WHEN current_resource.id IS NULL THEN context.value->'source'||jsonb_build_object('kind','unavailable','reason','notCaptured') ELSE context.value->'source' END,
      'roles',relations.roles,'councilBusinessIds',relations.business_ids) value,
      relations.proxy
    FROM context CROSS JOIN relations
    LEFT JOIN recorded ON recorded.id=relations.resource_id::text
    CROSS JOIN LATERAL (SELECT CASE WHEN context.value#>>'{source,kind}'='snapshot' THEN recorded.reference
      ELSE hall.meeting_document_reference(relations.resource_id) END AS value) reference
    LEFT JOIN hall.resource current_resource ON current_resource.id=relations.resource_id AND reference.value IS NOT NULL
    LEFT JOIN hall.binary_object bytes ON bytes.id=(reference.value->>'binaryObject')::UUID
  )
  SELECT jsonb_build_object('councilMeetingId',target_meeting,'groups',jsonb_build_array(
    jsonb_build_object('kind','noticeAndAgenda','notices',hall_api.list_meeting_notices(target_meeting),'agendaFreeze',hall_api.open_council_agenda_freeze(target_meeting)),
    jsonb_build_object('kind','proxies','resources',(SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) FROM resources WHERE proxy)),
    jsonb_build_object('kind','decisions','decisions',(SELECT coalesce(jsonb_agg(hall.council_decision_summary(decision) ORDER BY decision.created_at,decision.id),'[]'::jsonb)
      FROM hall.council_decision decision JOIN hall.council_decision_facts facts ON facts.ballot=decision.ballot WHERE facts.facts#>>'{meeting,id}'=target_meeting::text)),
    jsonb_build_object('kind','minutes','minutes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',minutes.id,'generatedAt',document.generated_at,'documentId',document.id)),'[]'::jsonb)
      FROM hall.minutes LEFT JOIN hall.minutes_document document ON document.minutes=minutes.id WHERE minutes.council_meeting=target_meeting)),
    jsonb_build_object('kind','resources','resources',(SELECT coalesce(jsonb_agg(value ORDER BY value->>'title',value->>'id'),'[]'::jsonb) FROM resources WHERE NOT proxy)),
    jsonb_build_object('kind','businesses','businesses',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',business->>'council_business','title',folder.name,'source',context.value->'source',
      'agendaItemIds',(SELECT coalesce(jsonb_agg(item->'id' ORDER BY abs((item->>'position')::integer),item->>'id'),'[]'::jsonb)
        FROM jsonb_array_elements(context.value#>'{payload,agenda}') item WHERE item->>'council_business'=business->>'council_business')) ORDER BY folder.name),'[]'::jsonb)
      FROM jsonb_array_elements(context.value#>'{payload,businesses}') business
      LEFT JOIN hall.resource folder ON folder.folder_resource_id=(business->>'folder_resource')::UUID))
  )) FROM context WHERE context.value IS NOT NULL;
$$;

CREATE FUNCTION hall_api.meeting_document_resource(target_meeting UUID,target_resource UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  WITH context AS (SELECT hall.meeting_documentary_context(target_meeting) value),
  document AS (SELECT context.value->'source' source,hall.meeting_documentary_resource(context.value,target_resource) value FROM context)
  SELECT jsonb_build_object('source',source,'resource',value->'resource','editorAssets',(
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',asset->>'id','title',asset->>'title','mediaType',asset->>'mediaType') ORDER BY asset->>'id'),'[]'::jsonb)
    FROM jsonb_array_elements(value->'editorAssets') asset)) FROM document WHERE value->'resource' IS NOT NULL AND value->'resource'<>'null'::jsonb;
$$;

CREATE FUNCTION hall_api.meeting_document_content(target_meeting UUID,target_resource UUID,target_asset UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  WITH document AS (SELECT hall.meeting_documentary_resource(hall.meeting_documentary_context(target_meeting),target_resource) value),
  reference AS (SELECT CASE WHEN target_asset IS NULL THEN value->>'binaryObject' ELSE (
    SELECT asset->>'binaryObject' FROM jsonb_array_elements(value->'editorAssets') asset WHERE asset->>'id'=target_asset::text
  ) END::UUID id FROM document)
  SELECT jsonb_build_object('contentBase64',encode(bytes.content,'base64'),'mediaType',bytes.media_type)
  FROM reference JOIN hall.binary_object bytes ON bytes.id=reference.id;
$$;
