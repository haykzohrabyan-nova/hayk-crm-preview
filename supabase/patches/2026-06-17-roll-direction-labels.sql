-- Rename Roll Direction lookup labels to numbered short form
-- Old: "Top Off First" / "Bottom Off First" / "Right Off First" / "Left Off First"
-- New: "1-Top" / "2-Bottom" / "3-Right" / "4-Left"
--
-- NOTE: roll_direction is stored as the label string in ticket_line_items,
-- so we must update both the lookup table AND existing rows.

-- 1. Update the lookup option labels
UPDATE lookup_values SET label = '1-Top'    WHERE category = 'roll_direction' AND value = 'top_off_first';
UPDATE lookup_values SET label = '2-Bottom' WHERE category = 'roll_direction' AND value = 'bottom_off_first';
UPDATE lookup_values SET label = '3-Right'  WHERE category = 'roll_direction' AND value = 'right_off_first';
UPDATE lookup_values SET label = '4-Left'   WHERE category = 'roll_direction' AND value = 'left_off_first';

-- 2. Migrate existing line item rows to the new label strings
UPDATE ticket_line_items SET roll_direction = '1-Top'    WHERE roll_direction = 'Top Off First';
UPDATE ticket_line_items SET roll_direction = '2-Bottom' WHERE roll_direction = 'Bottom Off First';
UPDATE ticket_line_items SET roll_direction = '3-Right'  WHERE roll_direction = 'Right Off First';
UPDATE ticket_line_items SET roll_direction = '4-Left'   WHERE roll_direction = 'Left Off First';
