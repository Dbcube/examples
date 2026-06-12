/**
 * DBCube configuration for the examples + full test suite.
 *
 * `demo` (SQLite) powers the simple 01-09 examples with zero services.
 * The `ft_*` entries are REAL databases from docker-compose.yml:
 *     docker compose up -d --wait
 */
module.exports = function (config) {
    config.set({
        databases: {
            // ── Simple examples (no services needed) ────────────────────
            demo: {
                type: "sqlite",
                config: { DATABASE: "demo" }
            },

            // ── Full test suite: real engines from docker-compose.yml ───
            ft_sqlite: {
                type: "sqlite",
                config: { DATABASE: "fulltest" },
                pool: { maxConnections: 10 }
            },
            ft_mysql: {
                type: "mysql",
                config: {
                    HOST: "127.0.0.1",
                    USER: "root",
                    PASSWORD: "dbcube_test",
                    DATABASE: "fulltest",
                    PORT: 30045
                },
                pool: { maxConnections: 8, acquireTimeoutMs: 5000 },
                daemon: { requestTimeoutMs: 60000 }
            },
            ft_postgres: {
                type: "postgres",
                config: {
                    HOST: "127.0.0.1",
                    USER: "postgres",
                    PASSWORD: "dbcube_test",
                    DATABASE: "fulltest",
                    PORT: 30046
                },
                pool: { maxConnections: 8, acquireTimeoutMs: 5000 },
                daemon: { requestTimeoutMs: 60000 }
            },
            ft_mongo: {
                type: "mongodb",
                config: {
                    HOST: "127.0.0.1",
                    DATABASE: "fulltest",
                    PORT: 30047
                },
                daemon: { requestTimeoutMs: 60000 }
            }
        }
    });
};
