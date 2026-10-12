// Resource and replay identifiers have separate namespaces. Protect only the
// matching historical asset, including immutable upgrade supplements.
function isReferenced(db, courseId, kind, assetId) {
  if (!['resource','replay'].includes(kind)) throw new TypeError('Unknown lesson asset kind');
  const resource = kind === 'resource';
  const sameId = alias => `CAST(json_extract(${alias}.value,'$.id') AS TEXT)=@id`;
  const sameKind = alias => `COALESCE(json_extract(${alias}.value,'$.type'),'resource') ${resource ? "!=" : "="} 'replay'`;
  const predicates = [
    `EXISTS (SELECT 1 FROM json_each(v.content_json,'$.resources') a WHERE ${sameId('a')} AND ${sameKind('a')})`,
    `EXISTS (SELECT 1 FROM json_each(COALESCE(s.resources_json,'[]')) a WHERE ${sameId('a')} AND ${sameKind('a')})`,
  ];
  if (resource) {
    for (const document of ['v.content_json','s.lesson_json']) {
      const location = document === 'v.content_json' ? '$.lesson.article_blocks' : '$.article_blocks';
      predicates.push(`EXISTS (SELECT 1 FROM json_each(json_extract(${document},'${location}')) b WHERE CAST(json_extract(b.value,'$.resourceId') AS TEXT)=@id)`);
    }
  } else predicates.push(`EXISTS (SELECT 1 FROM json_each(v.content_json,'$.replays') a WHERE ${sameId('a')})`);
  return Boolean(db.prepare(`SELECT 1 FROM lesson_content_versions v JOIN lessons l ON l.id=v.lesson_id LEFT JOIN lesson_version_supplements s ON s.content_version_id=v.id WHERE l.course_id=@course AND (${predicates.join(' OR ')}) LIMIT 1`).get({course:Number(courseId),id:String(assetId)}));
}
module.exports = { isReferenced };
