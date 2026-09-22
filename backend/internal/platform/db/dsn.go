package db

import (
	"net/url"
	"strings"
)

func withSimpleProtocol(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	q := parsed.Query()
	q.Set("default_query_exec_mode", "simple_protocol")
	parsed.RawQuery = q.Encode()
	return parsed.String()
}

func isPoolerHost(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return strings.Contains(host, "-pooler.") || strings.Contains(host, ".pooler.")
}
