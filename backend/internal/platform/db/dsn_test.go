package db

import (
	"strings"
	"testing"
)

func TestIsPoolerHost(t *testing.T) {
	if !isPoolerHost("postgresql://u:p@ep-x-pooler.c-4.aws.neon.tech/db") {
		t.Fatal("expected pooler")
	}
	if isPoolerHost("postgresql://u:p@ep-x.c-4.aws.neon.tech/db") {
		t.Fatal("direct host is not pooler")
	}
}

func TestWithSimpleProtocol(t *testing.T) {
	got := withSimpleProtocol("postgresql://u:p@ep-x.example/db?sslmode=require")
	if !strings.Contains(got, "default_query_exec_mode=simple_protocol") {
		t.Fatalf("missing simple protocol")
	}
}
