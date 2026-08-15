-- The integration tests build a throwaway schema and drop it afterwards, but
-- they still need a database to do it in. Giving them their own keeps them off
-- interim_dev, which holds the bills entered during development.
--
-- Postgres runs this once, when the volume is first created.
CREATE DATABASE interim_test OWNER luma;
