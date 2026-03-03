/*
  # Tag Position History Schema

  1. New Tables
    - `tag_positions`
      - `id` (uuid, primary key) - Unique record ID
      - `tag_id` (text) - Tag identifier (e.g., tag01, tag02)
      - `x` (real) - X coordinate in meters
      - `y` (real) - Y coordinate in meters
      - `z` (real) - Z coordinate (height) in meters
      - `accuracy` (real) - Estimated accuracy of the position
      - `timestamp` (timestamptz) - Time when position was recorded
      - `created_at` (timestamptz) - Record creation time

  2. Indexes
    - Index on tag_id for fast lookups
    - Index on timestamp for time-based queries
    - Composite index on (tag_id, timestamp) for efficient queries

  3. Security
    - Enable RLS on `tag_positions` table
    - Add policies for authenticated users to read and write data
*/

CREATE TABLE IF NOT EXISTS tag_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id text NOT NULL,
  x real NOT NULL,
  y real NOT NULL,
  z real NOT NULL,
  accuracy real DEFAULT 0,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tag_positions_tag_id ON tag_positions(tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_positions_timestamp ON tag_positions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tag_positions_tag_timestamp ON tag_positions(tag_id, timestamp DESC);

-- Enable RLS
ALTER TABLE tag_positions ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read all positions
CREATE POLICY "Authenticated users can read tag positions"
  ON tag_positions
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy for authenticated users to insert positions
CREATE POLICY "Authenticated users can insert tag positions"
  ON tag_positions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy for public access (for this IoT use case)
CREATE POLICY "Public can read tag positions"
  ON tag_positions
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Public can insert tag positions"
  ON tag_positions
  FOR INSERT
  TO anon
  WITH CHECK (true);