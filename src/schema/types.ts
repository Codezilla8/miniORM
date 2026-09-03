export type RelationKind = "hasMany" | "belongsTo";

export interface RelationDefinition {
  kind: RelationKind;
  /** Name of the related model, as registered via db.model(name, ...). */
  target: string;
  /**
   * hasMany:   this table's `localKey` (usually "id") is referenced by
   *            the target table's `foreignKey` (e.g. Post.userId).
   * belongsTo: this table's `foreignKey` (e.g. Post.userId) references
   *            the target table's `localKey` (usually "id").
   */
  foreignKey: string;
  localKey?: string; // defaults to "id"
}

export interface ModelDefinition {
  table: string;
  /** relationName -> definition, e.g. { posts: { kind: "hasMany", ... } } */
  relations?: Record<string, RelationDefinition>;
}
