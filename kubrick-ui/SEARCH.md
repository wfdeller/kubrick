# Library Search

The Library tab provides a powerful search capability to find recordings using text search and metadata filters.

## Search Syntax

### Text Search

Type any text to search across multiple fields:
- **title** - Recording title
- **description** - Recording description
- **recorderName** - Name of the person who recorded

Text search is case-insensitive and supports partial matching.

**Examples:**
- `john` - Find recordings where "john" appears in title, description, or recorder name
- `demo` - Find recordings containing "demo"
- `john smith` - Find recordings containing both "john" AND "smith" (multiple terms)

### Metadata Search

Use `key=value` syntax to search metadata fields. Metadata keys and values are case-insensitive with partial matching.

**Examples:**
- `Location=Studio` - Find recordings where Location metadata contains "Studio"
- `Project=Demo` - Find recordings where Project metadata contains "Demo"

For values containing spaces, use quotes:
- `Location="Studio A"` - Find recordings with Location containing "Studio A"
- `Project='Big Demo'` - Single quotes also work

### Combined Search

Combine text search and metadata filters in a single query:

**Examples:**
- `john Location=Studio` - Find recordings with "john" in text fields AND Location containing "Studio"
- `demo Project=Alpha Location="Room 1"` - Multiple conditions combined with AND logic

## Query Rules

1. **All conditions use AND logic** - Every term and filter must match
2. **Partial matching** - Search terms match anywhere in the field (e.g., "john" matches "Johnson")
3. **Case-insensitive** - "STUDIO", "Studio", and "studio" all match
4. **Multiple text terms** - Separated by spaces, all must match
5. **Multiple metadata filters** - All must match

## Technical Details

### Backend API

The search is handled by the `GET /api/recordings` endpoint with the `filter[search]` query parameter:

```
GET /api/recordings?filter[search]=john%20Location=Studio
```

### Query Parsing

The search query is parsed into:
- **Text terms** - Words not in `key=value` format
- **Metadata filters** - `key=value` pairs extracted using regex

### MongoDB Query

Text terms create `$or` conditions across title, description, and recorderName:
```javascript
{
  $or: [
    { title: { $regex: 'term', $options: 'i' } },
    { description: { $regex: 'term', $options: 'i' } },
    { recorderName: { $regex: 'term', $options: 'i' } }
  ]
}
```

Metadata filters use dot notation:
```javascript
{ 'metadata.Location': { $regex: 'Studio', $options: 'i' } }
```

All conditions are combined with `$and`.

## Performance Notes

- Search uses MongoDB regex queries (no text indexes required)
- Results are paginated (default 20 per page)
- Debouncing (300ms) prevents excessive API calls while typing
- Partial matching may be slower on very large datasets; consider adding text indexes if needed
