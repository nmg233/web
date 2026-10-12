-- Local extension namespace; no demo import and no seeded gifts or prices.
CREATE TABLE reward_images (
 id TEXT PRIMARY KEY,uploaded_by INTEGER NOT NULL REFERENCES users(id),
 upload_key TEXT NOT NULL,digest TEXT NOT NULL,file_path TEXT NOT NULL,mime_type TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(uploaded_by,upload_key)
);
CREATE TABLE reward_gifts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('physical','badge')),description TEXT NOT NULL DEFAULT '',
 image_id TEXT REFERENCES reward_images(id),
 price INTEGER NOT NULL CHECK(typeof(price)='integer' AND price BETWEEN 1 AND 1000000),
 stock INTEGER NOT NULL CHECK(typeof(stock)='integer' AND stock BETWEEN 0 AND 1000000),
 per_student_limit INTEGER CHECK(per_student_limit IS NULL OR (typeof(per_student_limit)='integer' AND per_student_limit BETWEEN 1 AND 1000000)),
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),revision INTEGER NOT NULL DEFAULT 1,
 created_by INTEGER NOT NULL REFERENCES users(id),updated_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(published=0 OR image_id IS NOT NULL)
);
CREATE TABLE reward_orders (
 id TEXT PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL,gift_id INTEGER NOT NULL REFERENCES reward_gifts(id),
 gift_name TEXT NOT NULL,gift_type TEXT NOT NULL CHECK(gift_type IN ('physical','badge')),
 gift_description TEXT NOT NULL,image_id TEXT REFERENCES reward_images(id),
 cost INTEGER NOT NULL CHECK(typeof(cost)='integer' AND cost>0),
 student_name TEXT NOT NULL,student_username TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','fulfilled')),
 created_at TEXT NOT NULL,fulfilled_at TEXT,fulfilled_by INTEGER REFERENCES users(id),
 fulfiller_name TEXT,UNIQUE(student_id,request_key)
);
CREATE INDEX reward_order_owner ON reward_orders(student_id,created_at DESC,id);
CREATE INDEX reward_order_limit ON reward_orders(student_id,gift_id);
CREATE TABLE reward_badge_grants (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES reward_orders(id) ON DELETE CASCADE,
 student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,gift_id INTEGER NOT NULL REFERENCES reward_gifts(id),
 name TEXT NOT NULL,description TEXT NOT NULL,image_id TEXT REFERENCES reward_images(id),earned_at TEXT NOT NULL,
 UNIQUE(student_id,gift_id)
);
-- Preserve the positive earning ledger and its checks. Orders are immutable debits.
-- A shared sequence provides stable pagination across earnings and spending.
CREATE TABLE coin_activity (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 income_id TEXT UNIQUE REFERENCES student_coin_ledger(id) ON DELETE CASCADE,
 order_id TEXT UNIQUE REFERENCES reward_orders(id) ON DELETE CASCADE,
 CHECK((income_id IS NULL)!=(order_id IS NULL))
);
INSERT INTO coin_activity(income_id) SELECT id FROM student_coin_ledger ORDER BY sequence;
CREATE TRIGGER coin_income_activity AFTER INSERT ON student_coin_ledger BEGIN
 INSERT INTO coin_activity(income_id) VALUES(NEW.id);
END;
CREATE TRIGGER coin_order_activity AFTER INSERT ON reward_orders BEGIN
 INSERT INTO coin_activity(order_id) VALUES(NEW.id);
END;
CREATE TABLE reward_admin_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,object_id TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
