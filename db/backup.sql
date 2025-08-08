--
-- PostgreSQL database dump
--

-- Dumped from database version 12.22 (Debian 12.22-1.pgdg110+1)
-- Dumped by pg_dump version 12.22 (Debian 12.22-1.pgdg110+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: tiger; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS tiger;


ALTER SCHEMA tiger OWNER TO postgres;

--
-- Name: tiger_data; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS tiger_data;


ALTER SCHEMA tiger_data OWNER TO postgres;

--
-- Name: topology; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS topology;


ALTER SCHEMA topology OWNER TO postgres;

--
-- Name: SCHEMA topology; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA topology IS 'PostGIS Topology schema';


--
-- Name: fuzzystrmatch; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA public;


--
-- Name: EXTENSION fuzzystrmatch; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION fuzzystrmatch IS 'determine similarities and distance between strings';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: postgis_tiger_geocoder; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder WITH SCHEMA tiger;


--
-- Name: EXTENSION postgis_tiger_geocoder; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis_tiger_geocoder IS 'PostGIS tiger geocoder and reverse geocoder';


--
-- Name: postgis_topology; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA topology;


--
-- Name: EXTENSION postgis_topology; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis_topology IS 'PostGIS topology spatial types and functions';


--
-- Name: auth_platform; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.auth_platform AS ENUM (
    'android',
    'ios'
);


ALTER TYPE public.auth_platform OWNER TO postgres;

--
-- Name: gender; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.gender AS ENUM (
    'male',
    'female',
    'other'
);


ALTER TYPE public.gender OWNER TO postgres;

--
-- Name: onboarding_step; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.onboarding_step AS ENUM (
    'personal_info',
    'phone_verification',
    'photo_upload',
    'completed'
);


ALTER TYPE public.onboarding_step OWNER TO postgres;

--
-- Name: ensure_one_profile_photo(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_one_profile_photo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.is_profile = TRUE THEN
        UPDATE user_photos
        SET is_profile = FALSE
        WHERE user_id = NEW.user_id
        AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.ensure_one_profile_photo() OWNER TO postgres;

--
-- Name: find_properties_within_range(integer, double precision); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.find_properties_within_range(user_id integer, distance_range_meters double precision DEFAULT 10000) RETURNS TABLE(property_id integer, property_title character varying, host_id integer, address text, city_name character varying, distance_meters double precision, max_guests integer, bedrooms integer, beds integer, bathrooms integer, is_within_range boolean)
    LANGUAGE sql
    AS $$
    SELECT 
        p.id AS property_id,
        p.title AS property_title,
        p.host_id,
        l.address,
        c.name AS city_name,
        ST_Distance(l.coordinates, u.location) AS distance_meters,
        p.max_guests,
        p.bedrooms,
        p.beds,
        p.bathrooms,
        ST_DWithin(l.coordinates, u.location, distance_range_meters) AS is_within_range
    FROM 
        properties p
    JOIN 
        locations l ON p.location_id = l.id
    JOIN 
        cities c ON l.city_id = c.id
    CROSS JOIN (
        SELECT location
        FROM users
        WHERE id = user_id
    ) AS u
    ORDER BY
        distance_meters ASC;
$$;


ALTER FUNCTION public.find_properties_within_range(user_id integer, distance_range_meters double precision) OWNER TO postgres;

--
-- Name: get_unread_message_count(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_unread_message_count(p_user_id integer) RETURNS TABLE(conversation_id integer, unread_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id AS conversation_id,
        COUNT(m.id) AS unread_count
    FROM 
        conversations c
    JOIN 
        properties p ON c.property_id = p.id
    LEFT JOIN 
        messages m ON c.id = m.conversation_id AND m.read_at IS NULL AND m.sender_id != p_user_id
    WHERE 
        c.user_id = p_user_id OR p.host_id = p_user_id
    GROUP BY 
        c.id;
END;
$$;


ALTER FUNCTION public.get_unread_message_count(p_user_id integer) OWNER TO postgres;

--
-- Name: mark_messages_as_read(integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_messages_as_read(p_conversation_id integer, p_user_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE messages
    SET read_at = CURRENT_TIMESTAMP
    WHERE 
        conversation_id = p_conversation_id AND
        sender_id != p_user_id AND
        read_at IS NULL;
END;
$$;


ALTER FUNCTION public.mark_messages_as_read(p_conversation_id integer, p_user_id integer) OWNER TO postgres;

--
-- Name: reset_property_hide_until(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reset_property_hide_until() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only run if there's an actual change to relevant property attributes
    IF (OLD.updated_at != NEW.updated_at) THEN
        
        -- Clear hide_until for all swipes related to this property
        UPDATE property_swipes
        SET hide_until = NULL
        WHERE property_id = NEW.id;
    END IF;
    
    -- Update the updated_at timestamp
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.reset_property_hide_until() OWNER TO postgres;

--
-- Name: update_modified_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_modified_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_modified_column() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: amenities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.amenities (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    icon character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.amenities OWNER TO postgres;

--
-- Name: amenities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.amenities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.amenities_id_seq OWNER TO postgres;

--
-- Name: amenities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.amenities_id_seq OWNED BY public.amenities.id;


--
-- Name: app_version; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_version (
    id integer NOT NULL,
    version character varying(50) NOT NULL,
    ios_build_number integer DEFAULT 1 NOT NULL,
    android_build_number integer DEFAULT 1 NOT NULL,
    environment character varying(20) DEFAULT 'develop'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    required_update boolean DEFAULT false,
    message text,
    ios_download_url character varying(255),
    android_download_url character varying(255)
);


ALTER TABLE public.app_version OWNER TO postgres;

--
-- Name: app_version_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.app_version_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.app_version_id_seq OWNER TO postgres;

--
-- Name: app_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.app_version_id_seq OWNED BY public.app_version.id;


--
-- Name: availability; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.availability (
    id integer NOT NULL,
    property_id integer,
    start_date date NOT NULL,
    end_date date NOT NULL,
    price_per_night numeric(10,2) NOT NULL,
    is_available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_date_range CHECK ((end_date >= start_date))
);


ALTER TABLE public.availability OWNER TO postgres;

--
-- Name: availability_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.availability_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.availability_id_seq OWNER TO postgres;

--
-- Name: availability_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.availability_id_seq OWNED BY public.availability.id;


--
-- Name: cities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    country_id integer,
    state_id integer,
    name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.cities OWNER TO postgres;

--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.cities_id_seq OWNER TO postgres;

--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- Name: contact_verifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact_verifications (
    id integer NOT NULL,
    user_id integer,
    verification_type character varying(10) NOT NULL,
    contact_value character varying(255) NOT NULL,
    country_code character varying(5),
    is_verified boolean DEFAULT false,
    last_code_request timestamp without time zone,
    code_requests_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT contact_verifications_verification_type_check CHECK (((verification_type)::text = ANY (ARRAY[('phone'::character varying)::text, ('email'::character varying)::text])))
);


ALTER TABLE public.contact_verifications OWNER TO postgres;

--
-- Name: TABLE contact_verifications; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.contact_verifications IS 'Stores verification status for both phone numbers and email addresses';


--
-- Name: contact_verifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.contact_verifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.contact_verifications_id_seq OWNER TO postgres;

--
-- Name: contact_verifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.contact_verifications_id_seq OWNED BY public.contact_verifications.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversations (
    id integer NOT NULL,
    property_id integer NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true
);


ALTER TABLE public.conversations OWNER TO postgres;

--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.conversations_id_seq OWNER TO postgres;

--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: countries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.countries (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character(2) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.countries OWNER TO postgres;

--
-- Name: countries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.countries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.countries_id_seq OWNER TO postgres;

--
-- Name: countries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.countries_id_seq OWNED BY public.countries.id;


--
-- Name: helper_modals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.helper_modals (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    route_path character varying(255) NOT NULL,
    image_url text NOT NULL,
    description text NOT NULL,
    button_text character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.helper_modals OWNER TO postgres;

--
-- Name: helper_modals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.helper_modals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.helper_modals_id_seq OWNER TO postgres;

--
-- Name: helper_modals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.helper_modals_id_seq OWNED BY public.helper_modals.id;


--
-- Name: host_subletter_swipes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.host_subletter_swipes (
    id integer NOT NULL,
    host_id integer NOT NULL,
    subletter_id integer NOT NULL,
    is_favorite boolean NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.host_subletter_swipes OWNER TO postgres;

--
-- Name: host_subletter_swipes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.host_subletter_swipes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.host_subletter_swipes_id_seq OWNER TO postgres;

--
-- Name: host_subletter_swipes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.host_subletter_swipes_id_seq OWNED BY public.host_subletter_swipes.id;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.locations (
    id integer NOT NULL,
    city_id integer NOT NULL,
    address text NOT NULL,
    coordinates public.geography(Point,4326) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.locations OWNER TO postgres;

--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.locations_id_seq OWNER TO postgres;

--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender_id integer NOT NULL,
    content text NOT NULL,
    sent_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    read_at timestamp with time zone
);


ALTER TABLE public.messages OWNER TO postgres;

--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.messages_id_seq OWNER TO postgres;

--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: otp; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.otp (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    otp_code character varying(4) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone DEFAULT (CURRENT_TIMESTAMP + '01:00:00'::interval)
);


ALTER TABLE public.otp OWNER TO postgres;

--
-- Name: otp_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.otp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.otp_id_seq OWNER TO postgres;

--
-- Name: otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.otp_id_seq OWNED BY public.otp.id;


--
-- Name: place_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.place_types (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    icon character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.place_types OWNER TO postgres;

--
-- Name: place_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.place_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.place_types_id_seq OWNER TO postgres;

--
-- Name: place_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.place_types_id_seq OWNED BY public.place_types.id;


--
-- Name: properties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.properties (
    id integer NOT NULL,
    host_id integer NOT NULL,
    place_type_id integer,
    location_id integer,
    max_guests integer NOT NULL,
    bedrooms integer NOT NULL,
    beds integer NOT NULL,
    bathrooms integer NOT NULL,
    roommates integer DEFAULT 0,
    size_sqm numeric(8,2),
    title character varying(35) NOT NULL,
    description character varying(105),
    last_minute_enabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    parking_spot boolean DEFAULT false,
    deleted_at timestamp with time zone,
    CONSTRAINT description_length CHECK ((char_length((description)::text) <= 105)),
    CONSTRAINT title_length CHECK ((char_length((title)::text) <= 35))
);


ALTER TABLE public.properties OWNER TO postgres;

--
-- Name: properties_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.properties_id_seq OWNER TO postgres;

--
-- Name: properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.properties_id_seq OWNED BY public.properties.id;


--
-- Name: property_amenities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.property_amenities (
    id integer NOT NULL,
    property_id integer NOT NULL,
    amenity_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.property_amenities OWNER TO postgres;

--
-- Name: property_amenities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.property_amenities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_amenities_id_seq OWNER TO postgres;

--
-- Name: property_amenities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.property_amenities_id_seq OWNED BY public.property_amenities.id;


--
-- Name: property_dates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.property_dates (
    id integer NOT NULL,
    property_id integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    price_per_night numeric NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.property_dates OWNER TO postgres;

--
-- Name: property_dates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.property_dates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_dates_id_seq OWNER TO postgres;

--
-- Name: property_dates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.property_dates_id_seq OWNED BY public.property_dates.id;


--
-- Name: property_photos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.property_photos (
    id integer NOT NULL,
    property_id integer,
    photo_url text NOT NULL,
    display_order integer NOT NULL,
    uploaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.property_photos OWNER TO postgres;

--
-- Name: property_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.property_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_photos_id_seq OWNER TO postgres;

--
-- Name: property_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.property_photos_id_seq OWNED BY public.property_photos.id;


--
-- Name: property_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.property_rules (
    id integer NOT NULL,
    property_id integer NOT NULL,
    rule_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.property_rules OWNER TO postgres;

--
-- Name: property_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.property_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_rules_id_seq OWNER TO postgres;

--
-- Name: property_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.property_rules_id_seq OWNED BY public.property_rules.id;


--
-- Name: property_styles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.property_styles (
    id integer NOT NULL,
    property_id integer NOT NULL,
    style_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.property_styles OWNER TO postgres;

--
-- Name: property_styles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.property_styles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_styles_id_seq OWNER TO postgres;

--
-- Name: property_styles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.property_styles_id_seq OWNED BY public.property_styles.id;


--
-- Name: property_swipe_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.property_swipe_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    property_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    action character varying(20) NOT NULL,
    CONSTRAINT check_valid_action CHECK (((action)::text = ANY (ARRAY[('like'::character varying)::text, ('dislike'::character varying)::text, ('withdraw'::character varying)::text, ('reject'::character varying)::text])))
);


ALTER TABLE public.property_swipe_history OWNER TO postgres;

--
-- Name: CONSTRAINT check_valid_action ON property_swipe_history; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON CONSTRAINT check_valid_action ON public.property_swipe_history IS 'Ensures that action can only be like, dislike, withdraw, or reject';


--
-- Name: property_swipe_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.property_swipe_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_swipe_history_id_seq OWNER TO postgres;

--
-- Name: property_swipe_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.property_swipe_history_id_seq OWNED BY public.property_swipe_history.id;


--
-- Name: property_swipes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.property_swipes (
    id integer NOT NULL,
    user_id integer NOT NULL,
    property_id integer NOT NULL,
    hide_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_valid_status CHECK (((status IS NULL) OR ((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('withdrawn'::character varying)::text, ('rejected'::character varying)::text]))))
);


ALTER TABLE public.property_swipes OWNER TO postgres;

--
-- Name: CONSTRAINT check_valid_status ON property_swipes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON CONSTRAINT check_valid_status ON public.property_swipes IS 'Ensures that status can only be NULL, pending, approved, withdrawn, or rejected';


--
-- Name: property_swipes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.property_swipes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.property_swipes_id_seq OWNER TO postgres;

--
-- Name: property_swipes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.property_swipes_id_seq OWNED BY public.property_swipes.id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reviews (
    id integer NOT NULL,
    property_id integer NOT NULL,
    user_id integer NOT NULL,
    rating numeric(2,1) NOT NULL,
    comment text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reviews_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric)))
);


ALTER TABLE public.reviews OWNER TO postgres;

--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.reviews_id_seq OWNER TO postgres;

--
-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


--
-- Name: rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rules (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    icon character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.rules OWNER TO postgres;

--
-- Name: rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.rules_id_seq OWNER TO postgres;

--
-- Name: rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.rules_id_seq OWNED BY public.rules.id;


--
-- Name: states; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.states (
    id integer NOT NULL,
    country_id integer,
    name character varying(100) NOT NULL,
    code character varying(10) NOT NULL
);


ALTER TABLE public.states OWNER TO postgres;

--
-- Name: states_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.states_id_seq OWNER TO postgres;

--
-- Name: states_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.states_id_seq OWNED BY public.states.id;


--
-- Name: styles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.styles (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    icon character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.styles OWNER TO postgres;

--
-- Name: styles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.styles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.styles_id_seq OWNER TO postgres;

--
-- Name: styles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.styles_id_seq OWNED BY public.styles.id;


--
-- Name: user_firebase_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_firebase_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    firebase_token character varying(255) NOT NULL,
    device_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_firebase_tokens OWNER TO postgres;

--
-- Name: user_firebase_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_firebase_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_firebase_tokens_id_seq OWNER TO postgres;

--
-- Name: user_firebase_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_firebase_tokens_id_seq OWNED BY public.user_firebase_tokens.id;


--
-- Name: user_modal_views; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_modal_views (
    id integer NOT NULL,
    user_id integer NOT NULL,
    helper_modal_id integer NOT NULL,
    viewed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_modal_views OWNER TO postgres;

--
-- Name: user_modal_views_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_modal_views_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_modal_views_id_seq OWNER TO postgres;

--
-- Name: user_modal_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_modal_views_id_seq OWNED BY public.user_modal_views.id;


--
-- Name: user_photos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_photos (
    id integer NOT NULL,
    user_id integer NOT NULL,
    photo_url text NOT NULL,
    is_profile boolean DEFAULT false,
    display_order integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_photos OWNER TO postgres;

--
-- Name: user_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_photos_id_seq OWNER TO postgres;

--
-- Name: user_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_photos_id_seq OWNED BY public.user_photos.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(254) NOT NULL,
    first_name character varying(50),
    last_name character varying(50),
    language character varying(50) DEFAULT 'en'::character varying,
    location public.geography(Point,4326),
    hash_password character varying(255),
    date_of_birth date,
    photo_url text,
    bio text,
    gender public.gender,
    refresh_token character varying(255),
    onboarding_step public.onboarding_step NOT NULL,
    google_id character varying(255),
    apple_id character varying(255),
    platform public.auth_platform NOT NULL,
    location_updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    address jsonb,
    instagram_username character varying(255),
    facebook_username character varying(255)
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: COLUMN users.address; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.users.address IS 'Stores geocoded address components like city, country, and formatted_address';


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: verification_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.verification_codes (
    id integer NOT NULL,
    contact_verification_id integer NOT NULL,
    code character varying(6) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempts integer DEFAULT 0,
    is_used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.verification_codes OWNER TO postgres;

--
-- Name: TABLE verification_codes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.verification_codes IS 'Stores verification codes for both phone and email verification processes';


--
-- Name: verification_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.verification_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.verification_codes_id_seq OWNER TO postgres;

--
-- Name: verification_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.verification_codes_id_seq OWNED BY public.verification_codes.id;


--
-- Name: amenities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.amenities ALTER COLUMN id SET DEFAULT nextval('public.amenities_id_seq'::regclass);


--
-- Name: app_version id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_version ALTER COLUMN id SET DEFAULT nextval('public.app_version_id_seq'::regclass);


--
-- Name: availability id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability ALTER COLUMN id SET DEFAULT nextval('public.availability_id_seq'::regclass);


--
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- Name: contact_verifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_verifications ALTER COLUMN id SET DEFAULT nextval('public.contact_verifications_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: countries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.countries ALTER COLUMN id SET DEFAULT nextval('public.countries_id_seq'::regclass);


--
-- Name: helper_modals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helper_modals ALTER COLUMN id SET DEFAULT nextval('public.helper_modals_id_seq'::regclass);


--
-- Name: host_subletter_swipes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.host_subletter_swipes ALTER COLUMN id SET DEFAULT nextval('public.host_subletter_swipes_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: otp id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp ALTER COLUMN id SET DEFAULT nextval('public.otp_id_seq'::regclass);


--
-- Name: place_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.place_types ALTER COLUMN id SET DEFAULT nextval('public.place_types_id_seq'::regclass);


--
-- Name: properties id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.properties ALTER COLUMN id SET DEFAULT nextval('public.properties_id_seq'::regclass);


--
-- Name: property_amenities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_amenities ALTER COLUMN id SET DEFAULT nextval('public.property_amenities_id_seq'::regclass);


--
-- Name: property_dates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_dates ALTER COLUMN id SET DEFAULT nextval('public.property_dates_id_seq'::regclass);


--
-- Name: property_photos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_photos ALTER COLUMN id SET DEFAULT nextval('public.property_photos_id_seq'::regclass);


--
-- Name: property_rules id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_rules ALTER COLUMN id SET DEFAULT nextval('public.property_rules_id_seq'::regclass);


--
-- Name: property_styles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_styles ALTER COLUMN id SET DEFAULT nextval('public.property_styles_id_seq'::regclass);


--
-- Name: property_swipe_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_swipe_history ALTER COLUMN id SET DEFAULT nextval('public.property_swipe_history_id_seq'::regclass);


--
-- Name: property_swipes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_swipes ALTER COLUMN id SET DEFAULT nextval('public.property_swipes_id_seq'::regclass);


--
-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


--
-- Name: rules id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rules ALTER COLUMN id SET DEFAULT nextval('public.rules_id_seq'::regclass);


--
-- Name: states id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.states ALTER COLUMN id SET DEFAULT nextval('public.states_id_seq'::regclass);


--
-- Name: styles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles ALTER COLUMN id SET DEFAULT nextval('public.styles_id_seq'::regclass);


--
-- Name: user_firebase_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_firebase_tokens ALTER COLUMN id SET DEFAULT nextval('public.user_firebase_tokens_id_seq'::regclass);


--
-- Name: user_modal_views id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_modal_views ALTER COLUMN id SET DEFAULT nextval('public.user_modal_views_id_seq'::regclass);


--
-- Name: user_photos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_photos ALTER COLUMN id SET DEFAULT nextval('public.user_photos_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: verification_codes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.verification_codes ALTER COLUMN id SET DEFAULT nextval('public.verification_codes_id_seq'::regclass);


--
-- Data for Name: amenities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.amenities (id, name, icon, created_at) FROM stdin;
1	WiFi	wifi	2025-04-01 01:12:37.518885+00
2	TV	tv	2025-04-01 01:12:37.518885+00
3	Dish washer	dish_washer	2025-04-01 01:12:37.518885+00
4	Heater	heater	2025-04-01 01:12:37.518885+00
5	Elevator	elevator	2025-04-01 01:12:37.518885+00
6	Balcony	balcony	2025-04-01 01:12:37.518885+00
7	Shelter	shelter	2025-04-01 01:12:37.518885+00
8	Washer	washer	2025-04-01 01:12:37.518885+00
9	Kitchen	kitchen	2025-04-01 01:12:37.518885+00
10	Free Parking	free_parking	2025-04-01 01:12:37.518885+00
11	Paid Parking	paid_parking	2025-04-01 01:12:37.518885+00
\.


--
-- Data for Name: app_version; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.app_version (id, version, ios_build_number, android_build_number, environment, updated_at, required_update, message, ios_download_url, android_download_url) FROM stdin;
1	1.2.2	1	1	production	2025-04-21 18:13:05.4466+00	f	Initial release	https://testflight.apple.com/join/kBMeYetz	https://play.google.com/apps/internaltest/4701552281438001759
2	1.2.2	1	1	develop	2025-04-21 18:13:05.45099+00	f	Initial release	https://testflight.apple.com/join/kBMeYetz	https://play.google.com/apps/internaltest/4701552281438001759
\.


--
-- Data for Name: availability; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.availability (id, property_id, start_date, end_date, price_per_night, is_available, created_at) FROM stdin;
\.


--
-- Data for Name: cities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cities (id, country_id, state_id, name, created_at) FROM stdin;
1	2	\N	Tel Aviv	2025-04-01 01:12:37.493407+00
2	1	1	Aventura	2025-04-01 01:12:37.502665+00
3	1	1	Fort Lauderdale	2025-04-01 01:12:37.502665+00
4	1	1	Hallandale Beach	2025-04-01 01:12:37.502665+00
5	1	1	Hollywood	2025-04-01 01:12:37.502665+00
6	1	1	Miami Beach	2025-04-01 01:12:37.502665+00
7	1	1	North Miami Beach	2025-04-01 01:12:37.502665+00
8	1	1	South Beach Miami	2025-04-01 01:12:37.502665+00
9	1	1	Sunny Isles Beach	2025-04-01 01:12:37.502665+00
10	1	1	Brickell Miami	2025-04-01 01:12:37.502665+00
11	1	1	Coconut Grove Miami	2025-04-01 01:12:37.502665+00
12	1	1	Design District Miami	2025-04-01 01:12:37.502665+00
13	1	1	Downtown Miami	2025-04-01 01:12:37.502665+00
14	1	1	Edgewater Miami	2025-04-01 01:12:37.502665+00
15	1	1	Midtown Miami	2025-04-01 01:12:37.502665+00
16	1	1	Wynwood, Miami	2025-04-01 01:12:37.502665+00
17	1	2	Manhattan	2025-04-01 01:12:37.502665+00
18	1	2	Brooklyn	2025-04-01 01:12:37.502665+00
19	1	2	Queens	2025-04-01 01:12:37.502665+00
20	1	2	The Bronx	2025-04-01 01:12:37.502665+00
21	1	2	Staten Island	2025-04-01 01:12:37.502665+00
\.


--
-- Data for Name: contact_verifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contact_verifications (id, user_id, verification_type, contact_value, country_code, is_verified, last_code_request, code_requests_count, created_at, updated_at) FROM stdin;
3	\N	email	jerome@test.com	\N	t	2025-05-08 20:41:10.478023	1	2025-05-08 20:40:34.962911	2025-05-08 20:41:20.8936
4	\N	email	donald@test.com	\N	t	\N	0	2025-05-08 21:02:54.160218	2025-05-08 21:07:15.179879
5	4	phone	2401259985	+1	t	\N	0	2025-05-08 21:19:03.838103	2025-05-08 21:19:14.395482
6	\N	email	jeff@test.com	\N	t	\N	0	2025-05-09 00:44:55.8977	2025-05-09 00:45:14.593995
7	5	phone	2406658525	+1	t	\N	0	2025-05-09 00:45:25.873958	2025-05-09 00:45:25.955777
8	\N	email	jensen@test.com	\N	t	2025-05-09 00:59:23.3977	2	2025-05-09 00:53:06.851558	2025-05-09 01:00:21.879797
9	6	phone	2408854411	+1	t	\N	0	2025-05-09 01:00:38.165432	2025-05-09 01:00:38.257362
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.conversations (id, property_id, user_id, created_at, updated_at, is_active) FROM stdin;
1	18	4	2025-05-19 00:37:20.511989+00	2025-05-19 00:38:08.845928+00	t
\.


--
-- Data for Name: countries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.countries (id, name, code, created_at) FROM stdin;
1	United States	US	2025-04-01 01:12:37.365224+00
2	Israel	IL	2025-04-01 01:12:37.365224+00
\.


--
-- Data for Name: helper_modals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.helper_modals (id, code, route_path, image_url, description, button_text, is_active, created_at, updated_at) FROM stdin;
1	match_home	/host-home	https://storage.subletme.co/subletme-develop/helper/helper_match.png	Here are tenants looking for a place like yours. Swipe through and select who you want to chat with. Coordinate directly to lock in your next booking	Start Swiping	t	2025-05-15 17:58:22.155079	2025-05-15 18:30:51.265346
\.


--
-- Data for Name: host_subletter_swipes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.host_subletter_swipes (id, host_id, subletter_id, is_favorite, created_at) FROM stdin;
\.


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.locations (id, city_id, address, coordinates, created_at) FROM stdin;
1	4	789 Ocean Drive	0101000020E61000006A25BE245F0854C0947DA19119C73940	2025-04-01 01:13:41.987447+00
2	5	123 Broadway Ave	0101000020E610000002E32A604C6354C0CBCA40AF89B34440	2025-04-01 01:13:44.306281+00
3	1	42 HaYarkon Street	0101000020E61000005F5FA1C5086241406B22D85D45094040	2025-04-01 01:13:46.501535+00
4	2	Sokolov St 91	0101000020E610000091ED2186C26C414043DB7B0272154040	2025-04-01 01:13:49.144423+00
5	3	HaAtsmaut St 60	0101000020E61000005CA736DD578D4140C64A71FA1F674040	2025-04-01 01:13:51.589947+00
6	4	340 Biscayne Blvd	0101000020E6100000D7EE682D160C54C042A89C4022C73940	2025-04-01 01:13:53.828625+00
7	5	651 Union St	0101000020E6100000B3035372F37E52C0C0571932C3564440	2025-04-01 01:13:56.070293+00
8	5	14 Country Road	0101000020E610000000000000000000000000000000000000	2025-04-01 01:14:00.303016+00
9	4	1247 West Ave	0101000020E6100000777984E4AEA158C0D36641CD35793D40	2025-04-01 01:14:02.174093+00
10	3	Graets St 7	0101000020E61000009DD9AED007634140E50F6157EE0A4040	2025-04-01 01:14:04.178427+00
11	5	1540 Broadway	0101000020E610000077989B140B7F52C0880E266A0E614440	2025-04-01 01:14:05.99176+00
12	2	Sderot Hen 8	0101000020E6100000246BC317DC634140C2233B808F094040	2025-04-01 01:14:08.008029+00
13	4	1200 Ocean Drive	0101000020E6100000857F6CED580854C0413C5CBC69C83940	2025-04-01 01:14:10.025614+00
14	1	25 Yefet Street	0101000020E6100000F5F23B4D666041400ADCBA9BA7064040	2025-04-01 01:14:12.089318+00
15	5	780 Park Avenue	0101000020E6100000F79B3F5CA87D52C0BD76C47CD4624440	2025-04-01 01:14:14.118565+00
16	3	Keren ha-Yesod St 9	0101000020E61000004128942AF69B4140FEBEDAAC55C63F40	2025-04-01 01:14:15.99642+00
17	4	9200 Collins Ave	0101000020E6100000CF296D16D40754C0647F8FB05EE13940	2025-04-01 01:14:18.042401+00
18	2	Bnei Binyamin St 10	0101000020E610000035102620816B4140D6C4025FD1154040	2025-04-01 01:14:19.984106+00
20	10	789 Ocean Drive	0101000020E61000001DA21BAB5E0854C0C9AA083719C73940	2025-05-09 14:02:27.101206+00
21	5	123 Broadway Ave	0101000020E6100000E25AED612F0A54C06254089A85023A40	2025-05-09 14:02:29.514344+00
22	1	42 HaYarkon Street	0101000020E61000005F5FA1C5086241406B22D85D45094040	2025-05-09 14:02:32.202168+00
23	2	Sokolov St 91	0101000020E61000004C8347C00D1D55C07DF43C6EAEEE3D40	2025-05-09 14:02:35.389574+00
24	3	HaAtsmaut St 60	0101000020E610000082902C60820854C0F2F7414C781E3A40	2025-05-09 14:02:37.836721+00
25	10	340 Biscayne Blvd	0101000020E61000004F2CA688420C54C094EEF8403CC23940	2025-05-09 14:02:40.327149+00
26	5	651 Union St	0101000020E6100000E25AED612F0A54C06254089A85023A40	2025-05-09 14:02:42.814502+00
27	5	14 Country Road	0101000020E6100000E25AED612F0A54C06254089A85023A40	2025-05-09 14:02:46.994835+00
28	10	1247 West Ave	0101000020E6100000BA96DA9C140954C0E1A7BBFC98C83940	2025-05-09 14:02:48.256406+00
29	3	Graets St 7	0101000020E6100000FF8AEBCEC90854C09DC4D622581F3A40	2025-05-09 14:02:50.270954+00
30	5	1540 Broadway	0101000020E6100000E988320A380B54C02052C2024EFF3940	2025-05-09 14:02:52.392957+00
31	2	Sderot Hen 8	0101000020E6100000472DDED9E80854C0243DB1F3DBF43940	2025-05-09 14:02:54.393106+00
32	10	1200 Ocean Drive	0101000020E6100000857F6CED580854C0413C5CBC69C83940	2025-05-09 14:02:56.414913+00
33	1	25 Yefet Street	0101000020E6100000F5F23B4D666041400ADCBA9BA7064040	2025-05-09 14:02:58.507817+00
34	5	780 Park Avenue	0101000020E6100000E25AED612F0A54C06254089A85023A40	2025-05-09 14:03:00.529175+00
35	3	Keren ha-Yesod St 9	0101000020E610000082902C60820854C0F2F7414C781E3A40	2025-05-09 14:03:02.60213+00
36	10	9200 Collins Ave	0101000020E6100000CF296D16D40754C0647F8FB05EE13940	2025-05-09 14:03:04.69831+00
37	2	Bnei Binyamin St 10	0101000020E6100000472DDED9E80854C0243DB1F3DBF43940	2025-05-09 14:03:06.69184+00
38	5	45 Water Street	0101000020E6100000E25AED612F0A54C06254089A85023A40	2025-05-09 14:03:08.767416+00
39	5	127 Kent Avenue	0101000020E6100000E25AED612F0A54C06254089A85023A40	2025-05-09 14:03:10.927562+00
40	1	Dizengoff Street 78	0101000020E6100000261AA4E02963414097E1E423CE094040	2025-05-09 14:03:12.97731+00
41	10	1501 SW 8th Street	0101000020E6100000284EA4EA0D0E54C0B68C8AEE0FC43940	2025-05-09 14:03:14.741741+00
42	2	HaSatat Street 12	0101000020E6100000472DDED9E80854C0243DB1F3DBF43940	2025-05-09 14:03:16.54169+00
43	3	HaMelacha Street 5	0101000020E61000005227A089B00754C07541D8840F243A40	2025-05-09 14:03:18.827588+00
44	5	15 Central Park West	0101000020E61000001C5833D78E0E54C0E5DB717962043A40	2025-05-09 14:03:20.682032+00
45	1	Shabazi Street 35	0101000020E6100000A0281AB50C6241406EFF250406084040	2025-05-09 14:03:23.337448+00
19	5	45 Water Street	0101000020E6100000E25AED612F0A54C06254089A85023A40	2025-04-01 01:14:22.022553+00
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, conversation_id, sender_id, content, sent_at, read_at) FROM stdin;
1	1	4	Hello elon	2025-05-19 00:37:20.511989+00	2025-05-19 01:19:12.179431+00
2	1	4	It's me	2025-05-19 00:38:08.845928+00	2025-05-19 01:19:12.179431+00
\.


--
-- Data for Name: otp; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.otp (id, email, otp_code, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: place_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.place_types (id, name, icon, created_at) FROM stdin;
1	House	house	2025-04-01 01:12:37.539116+00
2	Room	room	2025-04-01 01:12:37.539116+00
3	Flat Villa	flat_villa	2025-04-01 01:12:37.539116+00
4	Basement	basement	2025-04-01 01:12:37.539116+00
7	Apartment	apartment	2025-04-01 01:12:37.539116+00
8	Penthouse	penthouse	2025-04-01 01:12:37.539116+00
6	Studio	studio	2025-04-01 01:12:37.539116+00
\.


--
-- Data for Name: properties; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.properties (id, host_id, place_type_id, location_id, max_guests, bedrooms, beds, bathrooms, roommates, size_sqm, title, description, last_minute_enabled, created_at, updated_at, parking_spot, deleted_at) FROM stdin;
1	2	3	1	4	2	3	2	0	120.00	Beachfront Condo in Miami	Luxurious beachfront condo with stunning ocean views and modern amenities	t	2025-04-01 01:13:42.054426+00	2025-04-01 01:13:42.054426+00	\N	\N
2	2	3	2	3	1	2	1	0	95.00	Downtown Manhattan Loft	Spacious industrial loft in the heart of Manhattan with high ceilings and original details	f	2025-04-01 01:13:44.31078+00	2025-04-01 01:13:44.31078+00	\N	\N
3	2	3	3	2	0	1	1	0	45.00	Tel Aviv Beachside Studio	Cozy studio apartment just steps from the Mediterranean Sea	f	2025-04-01 01:13:46.503884+00	2025-04-01 01:13:46.503884+00	\N	\N
4	2	1	4	6	3	4	2	0	180.00	Herzliah Family Home	Spacious family home with garden in quiet neighborhood, perfect for families	f	2025-04-01 01:13:49.147467+00	2025-04-01 01:13:49.147467+00	\N	\N
5	2	2	5	1	1	1	1	2	18.00	Beer Sheva Student Room	Affordable room in shared apartment near Ben-Gurion University	t	2025-04-01 01:13:51.592381+00	2025-04-01 01:13:51.592381+00	\N	\N
6	2	6	6	2	1	1	1	0	40.00	Unique Boat House in Miami	Experience living on a renovated houseboat docked in Miami Marina	f	2025-04-01 01:13:53.83135+00	2025-04-01 01:13:53.83135+00	\N	\N
7	2	4	7	2	1	1	1	0	55.00	Brooklyn Basement Apartment	Cozy basement apartment with separate entrance in Brooklyn brownstone	f	2025-04-01 01:13:56.072251+00	2025-04-01 01:13:56.072251+00	\N	\N
9	2	7	9	2	0	1	1	0	25.00	Beachfront Camper in Miami	Vintage Airstream parked at exclusive Miami Beach RV resort	t	2025-04-01 01:14:02.181316+00	2025-04-01 01:14:02.181316+00	\N	\N
10	2	3	10	6	3	4	2	0	180.00	Beer Sheva Desert Villa	Modern villa with private pool on the outskirts of Beer Sheva	f	2025-04-01 01:14:04.186092+00	2025-04-01 01:14:04.186092+00	\N	\N
11	2	3	11	2	0	1	1	0	35.00	Times Square Studio	Compact but efficient studio in the heart of Times Square	t	2025-04-01 01:14:05.994548+00	2025-04-01 01:14:05.994548+00	\N	\N
12	2	3	12	2	1	1	1	0	65.00	Herzliah Tech Hub Apartment	Modern apartment in Herzliah's high-tech district with home office setup	f	2025-04-01 01:14:08.010952+00	2025-04-01 01:14:08.010952+00	\N	\N
13	2	3	13	3	1	2	1	0	70.00	South Beach Art Deco Gem	Colorful Art Deco apartment in iconic Miami South Beach district	f	2025-04-01 01:14:10.034743+00	2025-04-01 01:14:10.034743+00	\N	\N
14	2	3	14	3	1	2	1	0	75.00	Old City Tel Aviv Apartment	Charming apartment in Jaffa's Old City with authentic architectural details	f	2025-04-01 01:14:12.091427+00	2025-04-01 01:14:12.091427+00	\N	\N
15	2	3	15	4	2	3	2	0	110.00	Upper East Side Luxury	Elegant apartment in prestigious Upper East Side building with doorman	f	2025-04-01 01:14:14.130917+00	2025-04-01 01:14:14.130917+00	\N	\N
16	2	2	16	1	1	1	1	3	20.00	Beer Sheva Family Room	Private room in family home near Beer Sheva's Old City	t	2025-04-01 01:14:15.998504+00	2025-04-01 01:14:15.998504+00	\N	\N
17	2	8	17	2	1	1	1	0	30.00	Unique Underwater Room in Miami	Experience sleeping underwater in this innovative room with aquarium walls	f	2025-04-01 01:14:18.051413+00	2025-04-01 01:14:18.051413+00	\N	\N
18	2	3	18	8	4	5	3	0	250.00	Spacious Herzliah Villa	Luxurious villa with garden and pool in upscale Herzliah neighborhood	f	2025-04-01 01:14:19.986912+00	2025-04-01 01:14:19.986912+00	\N	\N
8	2	1	8	8	3	5	2	0	200.00	Rustic Barn near New York	Converted barn in the Hudson Valley, just 90 minutes from NYC	f	2025-04-01 01:14:00.307498+00	2025-04-08 13:24:02.964915+00	\N	\N
20	4	3	20	4	2	3	2	0	120.00	Beachfront Condo in Miami	Luxurious beachfront condo with stunning ocean views and modern amenities	t	2025-05-09 14:02:27.13936+00	2025-05-09 14:02:27.13936+00	\N	\N
21	4	3	21	3	1	2	1	0	95.00	Downtown Manhattan Loft	Spacious industrial loft in the heart of Manhattan with high ceilings and original details	f	2025-05-09 14:02:29.516609+00	2025-05-09 14:02:29.516609+00	\N	\N
22	4	3	22	2	0	1	1	0	45.00	Tel Aviv Beachside Studio	Cozy studio apartment just steps from the Mediterranean Sea	f	2025-05-09 14:02:32.20521+00	2025-05-09 14:02:32.20521+00	\N	\N
23	4	1	23	6	3	4	2	0	180.00	Herzliah Family Home	Spacious family home with garden in quiet neighborhood, perfect for families	f	2025-05-09 14:02:35.39349+00	2025-05-09 14:02:35.39349+00	\N	\N
24	4	2	24	1	1	1	1	2	18.00	Beer Sheva Student Room	Affordable room in shared apartment near Ben-Gurion University	t	2025-05-09 14:02:37.838704+00	2025-05-09 14:02:37.838704+00	\N	\N
25	4	6	25	2	1	1	1	0	40.00	Unique Boat House in Miami	Experience living on a renovated houseboat docked in Miami Marina	f	2025-05-09 14:02:40.329682+00	2025-05-09 14:02:40.329682+00	\N	\N
26	4	4	26	2	1	1	1	0	55.00	Brooklyn Basement Apartment	Cozy basement apartment with separate entrance in Brooklyn brownstone	f	2025-05-09 14:02:42.817137+00	2025-05-09 14:02:42.817137+00	\N	\N
28	4	7	28	2	0	1	1	0	25.00	Beachfront Camper in Miami	Vintage Airstream parked at exclusive Miami Beach RV resort	t	2025-05-09 14:02:48.259627+00	2025-05-09 14:02:48.259627+00	\N	\N
29	4	3	29	6	3	4	2	0	180.00	Beer Sheva Desert Villa	Modern villa with private pool on the outskirts of Beer Sheva	f	2025-05-09 14:02:50.301972+00	2025-05-09 14:02:50.301972+00	\N	\N
30	4	3	30	2	0	1	1	0	35.00	Times Square Studio	Compact but efficient studio in the heart of Times Square	t	2025-05-09 14:02:52.409926+00	2025-05-09 14:02:52.409926+00	\N	\N
31	4	3	31	2	1	1	1	0	65.00	Herzliah Tech Hub Apartment	Modern apartment in Herzliah's high-tech district with home office setup	f	2025-05-09 14:02:54.395847+00	2025-05-09 14:02:54.395847+00	\N	\N
32	4	3	32	3	1	2	1	0	70.00	South Beach Art Deco Gem	Colorful Art Deco apartment in iconic Miami South Beach district	f	2025-05-09 14:02:56.418586+00	2025-05-09 14:02:56.418586+00	\N	\N
33	4	3	33	3	1	2	1	0	75.00	Old City Tel Aviv Apartment	Charming apartment in Jaffa's Old City with authentic architectural details	f	2025-05-09 14:02:58.510171+00	2025-05-09 14:02:58.510171+00	\N	\N
34	4	3	34	4	2	3	2	0	110.00	Upper East Side Luxury	Elegant apartment in prestigious Upper East Side building with doorman	f	2025-05-09 14:03:00.540138+00	2025-05-09 14:03:00.540138+00	\N	\N
35	4	2	35	1	1	1	1	3	20.00	Beer Sheva Family Room	Private room in family home near Beer Sheva's Old City	t	2025-05-09 14:03:02.603968+00	2025-05-09 14:03:02.603968+00	\N	\N
36	4	8	36	2	1	1	1	0	30.00	Unique Underwater Room in Miami	Experience sleeping underwater in this innovative room with aquarium walls	f	2025-05-09 14:03:04.711646+00	2025-05-09 14:03:04.711646+00	\N	\N
37	4	3	37	8	4	5	3	0	250.00	Spacious Herzliah Villa	Luxurious villa with garden and pool in upscale Herzliah neighborhood	f	2025-05-09 14:03:06.69417+00	2025-05-09 14:03:06.69417+00	\N	\N
38	4	3	38	4	2	2	2	0	105.00	Brooklyn Bridge View Apartment	Stunning DUMBO loft with direct views of the Brooklyn Bridge	f	2025-05-09 14:03:08.773247+00	2025-05-09 14:03:08.773247+00	\N	\N
39	4	3	39	3	1	2	1	0	85.00	Williamsburg Rooftop Loft	Trendy loft with private rooftop terrace in hipster Williamsburg area	f	2025-05-09 14:03:10.93333+00	2025-05-09 14:03:10.93333+00	\N	\N
40	4	3	40	2	1	1	1	0	60.00	Tel Aviv Bauhaus Apartment	Historic Bauhaus-style apartment in Tel Aviv's White City UNESCO district	f	2025-05-09 14:03:12.98015+00	2025-05-09 14:03:12.98015+00	\N	\N
41	4	4	41	3	1	2	1	0	65.00	Miami Little Havana Casita	Colorful guesthouse in vibrant Little Havana with authentic Cuban charm	f	2025-05-09 14:03:14.749319+00	2025-05-09 14:03:14.749319+00	\N	\N
42	4	3	42	2	0	1	1	0	50.00	Herzliah Beachfront Studio	Modern studio apartment with direct beach access in Herzliah Pituach	t	2025-05-09 14:03:16.544324+00	2025-05-09 14:03:16.544324+00	\N	\N
43	4	3	43	2	1	1	1	0	80.00	Beer Sheva Artist Loft	Creative open-plan loft in Beer Sheva's emerging arts district	f	2025-05-09 14:03:18.837069+00	2025-05-09 14:03:18.837069+00	\N	\N
44	4	3	44	4	2	2	2	0	115.00	Central Park Adjacent Condo	Elegant condo with spectacular views overlooking Central Park	f	2025-05-09 14:03:20.684328+00	2025-05-09 14:03:20.684328+00	\N	\N
45	4	1	45	5	2	3	2	0	120.00	Historic Neve Tzedek Home	Renovated historic home in Tel Aviv's oldest and most charming neighborhood	f	2025-05-09 14:03:23.352456+00	2025-05-09 14:03:23.352456+00	\N	\N
19	2	3	19	4	2	2	2	0	105.00	Brooklyn Bridge View Apartment	Stunning DUMBO loft with direct views of the Brooklyn Bridge	f	2025-04-01 01:14:22.030047+00	2025-05-13 23:12:15.206662+00	\N	\N
\.


--
-- Data for Name: property_amenities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.property_amenities (id, property_id, amenity_id, created_at) FROM stdin;
1	1	1	2025-04-01 01:13:42.084573+00
2	1	2	2025-04-01 01:13:42.084573+00
3	1	3	2025-04-01 01:13:42.084573+00
4	1	5	2025-04-01 01:13:42.084573+00
5	1	6	2025-04-01 01:13:42.084573+00
6	1	8	2025-04-01 01:13:42.084573+00
7	1	9	2025-04-01 01:13:42.084573+00
8	1	10	2025-04-01 01:13:42.084573+00
9	2	1	2025-04-01 01:13:44.31078+00
10	2	2	2025-04-01 01:13:44.31078+00
11	2	3	2025-04-01 01:13:44.31078+00
12	2	5	2025-04-01 01:13:44.31078+00
13	2	9	2025-04-01 01:13:44.31078+00
14	3	1	2025-04-01 01:13:46.503884+00
15	3	2	2025-04-01 01:13:46.503884+00
16	3	6	2025-04-01 01:13:46.503884+00
17	3	9	2025-04-01 01:13:46.503884+00
18	4	1	2025-04-01 01:13:49.147467+00
19	4	2	2025-04-01 01:13:49.147467+00
20	4	3	2025-04-01 01:13:49.147467+00
21	4	4	2025-04-01 01:13:49.147467+00
22	4	7	2025-04-01 01:13:49.147467+00
23	4	8	2025-04-01 01:13:49.147467+00
24	4	9	2025-04-01 01:13:49.147467+00
25	4	10	2025-04-01 01:13:49.147467+00
26	5	1	2025-04-01 01:13:51.592381+00
27	5	9	2025-04-01 01:13:51.592381+00
28	6	1	2025-04-01 01:13:53.83135+00
29	6	2	2025-04-01 01:13:53.83135+00
30	6	9	2025-04-01 01:13:53.83135+00
31	7	1	2025-04-01 01:13:56.072251+00
32	7	2	2025-04-01 01:13:56.072251+00
33	7	3	2025-04-01 01:13:56.072251+00
34	7	4	2025-04-01 01:13:56.072251+00
35	7	8	2025-04-01 01:13:56.072251+00
36	7	9	2025-04-01 01:13:56.072251+00
37	8	1	2025-04-01 01:14:00.307498+00
38	8	2	2025-04-01 01:14:00.307498+00
39	8	4	2025-04-01 01:14:00.307498+00
40	8	9	2025-04-01 01:14:00.307498+00
41	8	10	2025-04-01 01:14:00.307498+00
42	9	1	2025-04-01 01:14:02.181316+00
43	9	2	2025-04-01 01:14:02.181316+00
44	9	9	2025-04-01 01:14:02.181316+00
45	9	10	2025-04-01 01:14:02.181316+00
46	10	1	2025-04-01 01:14:04.186092+00
47	10	2	2025-04-01 01:14:04.186092+00
48	10	3	2025-04-01 01:14:04.186092+00
49	10	4	2025-04-01 01:14:04.186092+00
50	10	6	2025-04-01 01:14:04.186092+00
51	10	7	2025-04-01 01:14:04.186092+00
52	10	8	2025-04-01 01:14:04.186092+00
53	10	9	2025-04-01 01:14:04.186092+00
54	10	10	2025-04-01 01:14:04.186092+00
55	11	1	2025-04-01 01:14:05.994548+00
56	11	2	2025-04-01 01:14:05.994548+00
57	11	5	2025-04-01 01:14:05.994548+00
58	11	9	2025-04-01 01:14:05.994548+00
59	12	1	2025-04-01 01:14:08.010952+00
60	12	2	2025-04-01 01:14:08.010952+00
61	12	3	2025-04-01 01:14:08.010952+00
62	12	5	2025-04-01 01:14:08.010952+00
63	12	9	2025-04-01 01:14:08.010952+00
64	12	10	2025-04-01 01:14:08.010952+00
65	13	1	2025-04-01 01:14:10.034743+00
66	13	2	2025-04-01 01:14:10.034743+00
67	13	6	2025-04-01 01:14:10.034743+00
68	13	9	2025-04-01 01:14:10.034743+00
69	13	11	2025-04-01 01:14:10.034743+00
70	14	1	2025-04-01 01:14:12.091427+00
71	14	2	2025-04-01 01:14:12.091427+00
72	14	9	2025-04-01 01:14:12.091427+00
73	14	10	2025-04-01 01:14:12.091427+00
74	15	1	2025-04-01 01:14:14.130917+00
75	15	2	2025-04-01 01:14:14.130917+00
76	15	3	2025-04-01 01:14:14.130917+00
77	15	5	2025-04-01 01:14:14.130917+00
78	15	6	2025-04-01 01:14:14.130917+00
79	15	8	2025-04-01 01:14:14.130917+00
80	15	9	2025-04-01 01:14:14.130917+00
81	15	11	2025-04-01 01:14:14.130917+00
82	16	1	2025-04-01 01:14:15.998504+00
83	16	2	2025-04-01 01:14:15.998504+00
84	16	4	2025-04-01 01:14:15.998504+00
85	16	7	2025-04-01 01:14:15.998504+00
86	16	9	2025-04-01 01:14:15.998504+00
87	17	1	2025-04-01 01:14:18.051413+00
88	17	2	2025-04-01 01:14:18.051413+00
89	17	9	2025-04-01 01:14:18.051413+00
90	18	1	2025-04-01 01:14:19.986912+00
91	18	2	2025-04-01 01:14:19.986912+00
92	18	3	2025-04-01 01:14:19.986912+00
93	18	4	2025-04-01 01:14:19.986912+00
94	18	6	2025-04-01 01:14:19.986912+00
95	18	7	2025-04-01 01:14:19.986912+00
96	18	8	2025-04-01 01:14:19.986912+00
97	18	9	2025-04-01 01:14:19.986912+00
98	18	10	2025-04-01 01:14:19.986912+00
106	20	1	2025-05-09 14:02:27.13936+00
107	20	2	2025-05-09 14:02:27.13936+00
108	20	3	2025-05-09 14:02:27.13936+00
109	20	5	2025-05-09 14:02:27.13936+00
110	20	6	2025-05-09 14:02:27.13936+00
111	20	8	2025-05-09 14:02:27.13936+00
112	20	9	2025-05-09 14:02:27.13936+00
113	20	10	2025-05-09 14:02:27.13936+00
114	21	1	2025-05-09 14:02:29.516609+00
115	21	2	2025-05-09 14:02:29.516609+00
116	21	3	2025-05-09 14:02:29.516609+00
117	21	5	2025-05-09 14:02:29.516609+00
118	21	9	2025-05-09 14:02:29.516609+00
119	22	1	2025-05-09 14:02:32.20521+00
120	22	2	2025-05-09 14:02:32.20521+00
121	22	6	2025-05-09 14:02:32.20521+00
122	22	9	2025-05-09 14:02:32.20521+00
123	23	1	2025-05-09 14:02:35.39349+00
124	23	2	2025-05-09 14:02:35.39349+00
125	23	3	2025-05-09 14:02:35.39349+00
126	23	4	2025-05-09 14:02:35.39349+00
127	23	7	2025-05-09 14:02:35.39349+00
128	23	8	2025-05-09 14:02:35.39349+00
129	23	9	2025-05-09 14:02:35.39349+00
130	23	10	2025-05-09 14:02:35.39349+00
131	24	1	2025-05-09 14:02:37.838704+00
132	24	9	2025-05-09 14:02:37.838704+00
133	25	1	2025-05-09 14:02:40.329682+00
134	25	2	2025-05-09 14:02:40.329682+00
135	25	9	2025-05-09 14:02:40.329682+00
136	26	1	2025-05-09 14:02:42.817137+00
137	26	2	2025-05-09 14:02:42.817137+00
138	26	3	2025-05-09 14:02:42.817137+00
139	26	4	2025-05-09 14:02:42.817137+00
140	26	8	2025-05-09 14:02:42.817137+00
141	26	9	2025-05-09 14:02:42.817137+00
142	28	1	2025-05-09 14:02:48.259627+00
143	28	2	2025-05-09 14:02:48.259627+00
144	28	9	2025-05-09 14:02:48.259627+00
145	28	10	2025-05-09 14:02:48.259627+00
146	29	1	2025-05-09 14:02:50.301972+00
147	29	2	2025-05-09 14:02:50.301972+00
148	29	3	2025-05-09 14:02:50.301972+00
149	29	4	2025-05-09 14:02:50.301972+00
150	29	6	2025-05-09 14:02:50.301972+00
151	29	7	2025-05-09 14:02:50.301972+00
152	29	8	2025-05-09 14:02:50.301972+00
153	29	9	2025-05-09 14:02:50.301972+00
154	29	10	2025-05-09 14:02:50.301972+00
155	30	1	2025-05-09 14:02:52.409926+00
156	30	2	2025-05-09 14:02:52.409926+00
157	30	5	2025-05-09 14:02:52.409926+00
158	30	9	2025-05-09 14:02:52.409926+00
159	31	1	2025-05-09 14:02:54.395847+00
160	31	2	2025-05-09 14:02:54.395847+00
161	31	3	2025-05-09 14:02:54.395847+00
162	31	5	2025-05-09 14:02:54.395847+00
163	31	9	2025-05-09 14:02:54.395847+00
164	31	10	2025-05-09 14:02:54.395847+00
165	32	1	2025-05-09 14:02:56.418586+00
166	32	2	2025-05-09 14:02:56.418586+00
167	32	6	2025-05-09 14:02:56.418586+00
168	32	9	2025-05-09 14:02:56.418586+00
169	32	11	2025-05-09 14:02:56.418586+00
170	33	1	2025-05-09 14:02:58.510171+00
171	33	2	2025-05-09 14:02:58.510171+00
172	33	9	2025-05-09 14:02:58.510171+00
173	33	10	2025-05-09 14:02:58.510171+00
174	34	1	2025-05-09 14:03:00.540138+00
175	34	2	2025-05-09 14:03:00.540138+00
176	34	3	2025-05-09 14:03:00.540138+00
177	34	5	2025-05-09 14:03:00.540138+00
178	34	6	2025-05-09 14:03:00.540138+00
179	34	8	2025-05-09 14:03:00.540138+00
180	34	9	2025-05-09 14:03:00.540138+00
181	34	11	2025-05-09 14:03:00.540138+00
182	35	1	2025-05-09 14:03:02.603968+00
183	35	2	2025-05-09 14:03:02.603968+00
184	35	4	2025-05-09 14:03:02.603968+00
185	35	7	2025-05-09 14:03:02.603968+00
186	35	9	2025-05-09 14:03:02.603968+00
187	36	1	2025-05-09 14:03:04.711646+00
188	36	2	2025-05-09 14:03:04.711646+00
189	36	9	2025-05-09 14:03:04.711646+00
190	37	1	2025-05-09 14:03:06.69417+00
191	37	2	2025-05-09 14:03:06.69417+00
192	37	3	2025-05-09 14:03:06.69417+00
193	37	4	2025-05-09 14:03:06.69417+00
194	37	6	2025-05-09 14:03:06.69417+00
195	37	7	2025-05-09 14:03:06.69417+00
196	37	8	2025-05-09 14:03:06.69417+00
197	37	9	2025-05-09 14:03:06.69417+00
198	37	10	2025-05-09 14:03:06.69417+00
199	38	1	2025-05-09 14:03:08.773247+00
200	38	2	2025-05-09 14:03:08.773247+00
201	38	3	2025-05-09 14:03:08.773247+00
202	38	5	2025-05-09 14:03:08.773247+00
203	38	6	2025-05-09 14:03:08.773247+00
204	38	9	2025-05-09 14:03:08.773247+00
205	38	11	2025-05-09 14:03:08.773247+00
206	39	1	2025-05-09 14:03:10.93333+00
207	39	2	2025-05-09 14:03:10.93333+00
208	39	3	2025-05-09 14:03:10.93333+00
209	39	6	2025-05-09 14:03:10.93333+00
210	39	9	2025-05-09 14:03:10.93333+00
211	39	10	2025-05-09 14:03:10.93333+00
212	40	1	2025-05-09 14:03:12.98015+00
213	40	2	2025-05-09 14:03:12.98015+00
214	40	3	2025-05-09 14:03:12.98015+00
215	40	5	2025-05-09 14:03:12.98015+00
216	40	9	2025-05-09 14:03:12.98015+00
217	41	1	2025-05-09 14:03:14.749319+00
218	41	2	2025-05-09 14:03:14.749319+00
219	41	4	2025-05-09 14:03:14.749319+00
220	41	9	2025-05-09 14:03:14.749319+00
221	41	10	2025-05-09 14:03:14.749319+00
222	42	1	2025-05-09 14:03:16.544324+00
223	42	2	2025-05-09 14:03:16.544324+00
224	42	5	2025-05-09 14:03:16.544324+00
225	42	6	2025-05-09 14:03:16.544324+00
226	42	9	2025-05-09 14:03:16.544324+00
227	43	1	2025-05-09 14:03:18.837069+00
228	43	2	2025-05-09 14:03:18.837069+00
229	43	3	2025-05-09 14:03:18.837069+00
230	43	9	2025-05-09 14:03:18.837069+00
231	43	10	2025-05-09 14:03:18.837069+00
232	44	1	2025-05-09 14:03:20.684328+00
233	44	2	2025-05-09 14:03:20.684328+00
234	44	3	2025-05-09 14:03:20.684328+00
235	44	5	2025-05-09 14:03:20.684328+00
236	44	6	2025-05-09 14:03:20.684328+00
237	44	8	2025-05-09 14:03:20.684328+00
238	44	9	2025-05-09 14:03:20.684328+00
239	44	11	2025-05-09 14:03:20.684328+00
240	45	1	2025-05-09 14:03:23.352456+00
241	45	2	2025-05-09 14:03:23.352456+00
242	45	3	2025-05-09 14:03:23.352456+00
243	45	4	2025-05-09 14:03:23.352456+00
244	45	7	2025-05-09 14:03:23.352456+00
245	45	9	2025-05-09 14:03:23.352456+00
246	45	10	2025-05-09 14:03:23.352456+00
254	19	1	2025-05-13 23:12:15.206662+00
255	19	2	2025-05-13 23:12:15.206662+00
256	19	3	2025-05-13 23:12:15.206662+00
257	19	5	2025-05-13 23:12:15.206662+00
258	19	6	2025-05-13 23:12:15.206662+00
259	19	9	2025-05-13 23:12:15.206662+00
260	19	11	2025-05-13 23:12:15.206662+00
\.


--
-- Data for Name: property_dates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.property_dates (id, property_id, start_date, end_date, price_per_night, created_at) FROM stdin;
1	1	2025-04-05	2025-09-30	275	2025-04-01 01:13:42.070497
2	2	2025-05-15	2025-08-15	350	2025-04-01 01:13:44.31078
3	3	2025-06-01	2025-08-31	180	2025-04-01 01:13:46.503884
4	4	2025-07-10	2025-09-10	320	2025-04-01 01:13:49.147467
5	5	2025-09-01	2026-06-30	85	2025-04-01 01:13:51.592381
6	6	2025-05-20	2025-07-20	210	2025-04-01 01:13:53.83135
7	7	2025-06-15	2025-12-15	175	2025-04-01 01:13:56.072251
8	8	2025-07-01	2025-09-30	290	2025-04-01 01:14:00.307498
9	9	2025-04-01	2025-10-31	120	2025-04-01 01:14:02.181316
10	10	2025-05-15	2025-09-15	280	2025-04-01 01:14:04.186092
11	11	2025-04-10	2025-07-10	220	2025-04-01 01:14:05.994548
12	12	2025-06-01	2025-12-01	210	2025-04-01 01:14:08.010952
13	13	2025-05-01	2025-08-31	240	2025-04-01 01:14:10.034743
14	14	2025-07-15	2025-10-15	195	2025-04-01 01:14:12.091427
15	15	2025-09-01	2026-01-15	480	2025-04-01 01:14:14.130917
16	16	2025-05-01	2025-08-31	75	2025-04-01 01:14:15.998504
17	17	2025-06-15	2025-07-15	550	2025-04-01 01:14:18.051413
18	18	2025-07-01	2025-08-31	520	2025-04-01 01:14:19.986912
20	20	2025-05-14	2025-11-08	275	2025-05-09 14:02:27.13936
21	21	2025-05-15	2025-08-15	350	2025-05-09 14:02:29.516609
22	22	2025-06-01	2025-08-31	180	2025-05-09 14:02:32.20521
23	23	2025-07-10	2025-09-10	320	2025-05-09 14:02:35.39349
24	24	2025-09-01	2026-06-30	85	2025-05-09 14:02:37.838704
25	25	2025-05-20	2025-07-20	210	2025-05-09 14:02:40.329682
26	26	2025-06-15	2025-12-15	175	2025-05-09 14:02:42.817137
27	28	2025-05-14	2025-12-13	120	2025-05-09 14:02:48.259627
28	29	2025-05-15	2025-09-15	280	2025-05-09 14:02:50.301972
29	30	2025-05-14	2025-08-13	220	2025-05-09 14:02:52.409926
30	31	2025-06-01	2025-12-01	210	2025-05-09 14:02:54.395847
31	32	2025-05-14	2025-09-13	240	2025-05-09 14:02:56.418586
32	33	2025-07-15	2025-10-15	195	2025-05-09 14:02:58.510171
33	34	2025-09-01	2026-01-15	480	2025-05-09 14:03:00.540138
34	35	2025-05-14	2025-09-13	75	2025-05-09 14:03:02.603968
35	36	2025-06-15	2025-07-15	550	2025-05-09 14:03:04.711646
36	37	2025-07-01	2025-08-31	520	2025-05-09 14:03:06.69417
37	38	2025-08-15	2025-11-15	390	2025-05-09 14:03:08.773247
38	39	2025-06-10	2025-09-10	320	2025-05-09 14:03:10.93333
39	40	2025-05-20	2025-08-20	215	2025-05-09 14:03:12.98015
40	41	2025-06-15	2025-09-15	195	2025-05-09 14:03:14.749319
41	42	2025-05-16	2025-07-16	230	2025-05-09 14:03:16.544324
42	43	2025-07-01	2025-10-01	175	2025-05-09 14:03:18.837069
43	44	2025-08-01	2025-11-01	520	2025-05-09 14:03:20.684328
44	45	2025-07-01	2025-09-30	380	2025-05-09 14:03:23.352456
19	19	2025-08-15	2025-11-15	395	2025-04-01 01:14:22.030047
\.


--
-- Data for Name: property_photos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.property_photos (id, property_id, photo_url, display_order, uploaded_at) FROM stdin;
1	1	https://storage.subletme.co/subletme-develop/properties/1/1.avif	1	2025-04-01 01:13:43.066777+00
2	1	https://storage.subletme.co/subletme-develop/properties/1/2.avif	2	2025-04-01 01:13:43.082978+00
3	1	https://storage.subletme.co/subletme-develop/properties/1/3.avif	3	2025-04-01 01:13:43.087795+00
4	1	https://storage.subletme.co/subletme-develop/properties/1/4.avif	4	2025-04-01 01:13:43.091181+00
5	2	https://storage.subletme.co/subletme-develop/properties/2/1.webp	1	2025-04-01 01:13:45.296555+00
6	2	https://storage.subletme.co/subletme-develop/properties/2/2.jpeg	2	2025-04-01 01:13:45.303979+00
7	2	https://storage.subletme.co/subletme-develop/properties/2/3.webp	3	2025-04-01 01:13:45.309661+00
8	2	https://storage.subletme.co/subletme-develop/properties/2/4.webp	4	2025-04-01 01:13:45.314054+00
9	3	https://storage.subletme.co/subletme-develop/properties/3/1.webp	1	2025-04-01 01:13:47.897309+00
10	3	https://storage.subletme.co/subletme-develop/properties/3/2.webp	2	2025-04-01 01:13:47.902944+00
11	3	https://storage.subletme.co/subletme-develop/properties/3/3.jpeg	3	2025-04-01 01:13:47.906425+00
12	3	https://storage.subletme.co/subletme-develop/properties/3/4.webp	4	2025-04-01 01:13:47.908597+00
13	4	https://storage.subletme.co/subletme-develop/properties/4/1.webp	1	2025-04-01 01:13:50.372511+00
14	4	https://storage.subletme.co/subletme-develop/properties/4/2.webp	2	2025-04-01 01:13:50.379073+00
15	4	https://storage.subletme.co/subletme-develop/properties/4/3.jpeg	3	2025-04-01 01:13:50.383731+00
16	4	https://storage.subletme.co/subletme-develop/properties/4/4.webp	4	2025-04-01 01:13:50.388626+00
17	5	https://storage.subletme.co/subletme-develop/properties/5/1.jpeg	1	2025-04-01 01:13:52.611792+00
18	5	https://storage.subletme.co/subletme-develop/properties/5/2.jpeg	2	2025-04-01 01:13:52.617193+00
19	5	https://storage.subletme.co/subletme-develop/properties/5/3.jpeg	3	2025-04-01 01:13:52.622415+00
20	5	https://storage.subletme.co/subletme-develop/properties/5/4.webp	4	2025-04-01 01:13:52.625706+00
21	6	https://storage.subletme.co/subletme-develop/properties/6/1.jpeg	1	2025-04-01 01:13:54.887682+00
22	6	https://storage.subletme.co/subletme-develop/properties/6/2.jpeg	2	2025-04-01 01:13:54.892859+00
23	6	https://storage.subletme.co/subletme-develop/properties/6/3.jpeg	3	2025-04-01 01:13:54.897058+00
24	6	https://storage.subletme.co/subletme-develop/properties/6/4.jpeg	4	2025-04-01 01:13:54.899777+00
25	7	https://storage.subletme.co/subletme-develop/properties/7/1.webp	1	2025-04-01 01:13:57.609545+00
26	7	https://storage.subletme.co/subletme-develop/properties/7/2.jpeg	2	2025-04-01 01:13:57.616627+00
27	7	https://storage.subletme.co/subletme-develop/properties/7/3.jpeg	3	2025-04-01 01:13:57.620984+00
28	7	https://storage.subletme.co/subletme-develop/properties/7/4.jpeg	4	2025-04-01 01:13:57.62414+00
29	8	https://storage.subletme.co/subletme-develop/properties/8/1.avif	1	2025-04-01 01:14:00.974046+00
30	8	https://storage.subletme.co/subletme-develop/properties/8/2.avif	2	2025-04-01 01:14:00.981685+00
31	8	https://storage.subletme.co/subletme-develop/properties/8/3.avif	3	2025-04-01 01:14:00.985887+00
32	8	https://storage.subletme.co/subletme-develop/properties/8/4.avif	4	2025-04-01 01:14:00.989873+00
33	9	https://storage.subletme.co/subletme-develop/properties/9/1.avif	1	2025-04-01 01:14:03.028047+00
34	9	https://storage.subletme.co/subletme-develop/properties/9/2.avif	2	2025-04-01 01:14:03.036029+00
35	9	https://storage.subletme.co/subletme-develop/properties/9/3.avif	3	2025-04-01 01:14:03.040709+00
36	9	https://storage.subletme.co/subletme-develop/properties/9/4.avif	4	2025-04-01 01:14:03.043856+00
37	10	https://storage.subletme.co/subletme-develop/properties/10/1.avif	1	2025-04-01 01:14:04.863787+00
38	10	https://storage.subletme.co/subletme-develop/properties/10/2.avif	2	2025-04-01 01:14:04.874662+00
39	10	https://storage.subletme.co/subletme-develop/properties/10/3.avif	3	2025-04-01 01:14:04.880586+00
40	10	https://storage.subletme.co/subletme-develop/properties/10/4.avif	4	2025-04-01 01:14:04.884719+00
41	11	https://storage.subletme.co/subletme-develop/properties/11/1.avif	1	2025-04-01 01:14:06.871105+00
42	11	https://storage.subletme.co/subletme-develop/properties/11/2.avif	2	2025-04-01 01:14:06.882579+00
43	11	https://storage.subletme.co/subletme-develop/properties/11/3.avif	3	2025-04-01 01:14:06.888778+00
44	11	https://storage.subletme.co/subletme-develop/properties/11/4.avif	4	2025-04-01 01:14:06.893667+00
45	12	https://storage.subletme.co/subletme-develop/properties/12/1.avif	1	2025-04-01 01:14:08.849377+00
46	12	https://storage.subletme.co/subletme-develop/properties/12/2.avif	2	2025-04-01 01:14:08.858083+00
47	12	https://storage.subletme.co/subletme-develop/properties/12/3.avif	3	2025-04-01 01:14:08.86289+00
48	12	https://storage.subletme.co/subletme-develop/properties/12/4.avif	4	2025-04-01 01:14:08.866449+00
49	13	https://storage.subletme.co/subletme-develop/properties/13/1.jpeg	1	2025-04-01 01:14:10.909944+00
50	13	https://storage.subletme.co/subletme-develop/properties/13/2.avif	2	2025-04-01 01:14:10.918522+00
51	13	https://storage.subletme.co/subletme-develop/properties/13/3.avif	3	2025-04-01 01:14:10.92395+00
52	13	https://storage.subletme.co/subletme-develop/properties/13/4.avif	4	2025-04-01 01:14:10.928675+00
53	14	https://storage.subletme.co/subletme-develop/properties/14/1.avif	1	2025-04-01 01:14:12.976316+00
54	14	https://storage.subletme.co/subletme-develop/properties/14/2.avif	2	2025-04-01 01:14:12.983384+00
55	14	https://storage.subletme.co/subletme-develop/properties/14/3.jpeg	3	2025-04-01 01:14:12.988317+00
56	14	https://storage.subletme.co/subletme-develop/properties/14/4.avif	4	2025-04-01 01:14:12.99218+00
57	15	https://storage.subletme.co/subletme-develop/properties/15/1.avif	1	2025-04-01 01:14:14.840943+00
58	15	https://storage.subletme.co/subletme-develop/properties/15/2.avif	2	2025-04-01 01:14:14.848244+00
59	15	https://storage.subletme.co/subletme-develop/properties/15/3.avif	3	2025-04-01 01:14:14.854479+00
60	15	https://storage.subletme.co/subletme-develop/properties/15/4.avif	4	2025-04-01 01:14:14.857832+00
61	16	https://storage.subletme.co/subletme-develop/properties/16/1.avif	1	2025-04-01 01:14:16.904887+00
62	16	https://storage.subletme.co/subletme-develop/properties/16/2.avif	2	2025-04-01 01:14:16.912255+00
63	16	https://storage.subletme.co/subletme-develop/properties/16/3.webp	3	2025-04-01 01:14:16.91716+00
64	16	https://storage.subletme.co/subletme-develop/properties/16/4.avif	4	2025-04-01 01:14:16.921635+00
65	17	https://storage.subletme.co/subletme-develop/properties/17/1.avif	1	2025-04-01 01:14:18.834052+00
66	17	https://storage.subletme.co/subletme-develop/properties/17/2.avif	2	2025-04-01 01:14:18.84156+00
67	17	https://storage.subletme.co/subletme-develop/properties/17/3.avif	3	2025-04-01 01:14:18.84597+00
68	17	https://storage.subletme.co/subletme-develop/properties/17/4.avif	4	2025-04-01 01:14:18.848995+00
69	18	https://storage.subletme.co/subletme-develop/properties/18/1.avif	1	2025-04-01 01:14:20.835977+00
70	18	https://storage.subletme.co/subletme-develop/properties/18/2.avif	2	2025-04-01 01:14:20.843977+00
71	18	https://storage.subletme.co/subletme-develop/properties/18/3.avif	3	2025-04-01 01:14:20.849382+00
72	18	https://storage.subletme.co/subletme-develop/properties/18/4.avif	4	2025-04-01 01:14:20.855783+00
73	19	https://storage.subletme.co/subletme-develop/properties/19/1.avif	1	2025-04-01 01:14:23.125328+00
74	19	https://storage.subletme.co/subletme-develop/properties/19/2.webp	2	2025-04-01 01:14:23.133294+00
75	19	https://storage.subletme.co/subletme-develop/properties/19/3.avif	3	2025-04-01 01:14:23.138275+00
76	19	https://storage.subletme.co/subletme-develop/properties/19/4.avif	4	2025-04-01 01:14:23.141428+00
77	20	https://storage.subletme.co/subletme-develop/properties/20/1746799347194_1.avif	1	2025-05-09 14:02:28.260741+00
78	20	https://storage.subletme.co/subletme-develop/properties/20/1746799347552_2.avif	2	2025-05-09 14:02:28.275005+00
79	20	https://storage.subletme.co/subletme-develop/properties/20/1746799347782_3.avif	3	2025-05-09 14:02:28.277274+00
80	20	https://storage.subletme.co/subletme-develop/properties/20/1746799347990_4.avif	4	2025-05-09 14:02:28.2789+00
81	21	https://storage.subletme.co/subletme-develop/properties/21/1746799349526_1.webp	1	2025-05-09 14:02:30.931626+00
82	21	https://storage.subletme.co/subletme-develop/properties/21/1746799349952_2.jpeg	2	2025-05-09 14:02:30.953632+00
83	21	https://storage.subletme.co/subletme-develop/properties/21/1746799350403_3.webp	3	2025-05-09 14:02:30.960211+00
84	21	https://storage.subletme.co/subletme-develop/properties/21/1746799350666_4.webp	4	2025-05-09 14:02:30.96282+00
85	22	https://storage.subletme.co/subletme-develop/properties/22/1746799352214_1.webp	1	2025-05-09 14:02:34.11652+00
86	22	https://storage.subletme.co/subletme-develop/properties/22/1746799352796_2.webp	2	2025-05-09 14:02:34.133912+00
87	22	https://storage.subletme.co/subletme-develop/properties/22/1746799353137_3.jpeg	3	2025-05-09 14:02:34.136519+00
88	22	https://storage.subletme.co/subletme-develop/properties/22/1746799353782_4.webp	4	2025-05-09 14:02:34.138317+00
89	23	https://storage.subletme.co/subletme-develop/properties/23/1746799355408_1.webp	1	2025-05-09 14:02:36.577404+00
90	23	https://storage.subletme.co/subletme-develop/properties/23/1746799355706_2.webp	2	2025-05-09 14:02:36.591962+00
91	23	https://storage.subletme.co/subletme-develop/properties/23/1746799355981_3.jpeg	3	2025-05-09 14:02:36.595805+00
92	23	https://storage.subletme.co/subletme-develop/properties/23/1746799356299_4.webp	4	2025-05-09 14:02:36.597823+00
93	24	https://storage.subletme.co/subletme-develop/properties/24/1746799357848_1.jpeg	1	2025-05-09 14:02:39.050524+00
94	24	https://storage.subletme.co/subletme-develop/properties/24/1746799358182_2.jpeg	2	2025-05-09 14:02:39.065287+00
95	24	https://storage.subletme.co/subletme-develop/properties/24/1746799358493_3.jpeg	3	2025-05-09 14:02:39.071031+00
96	24	https://storage.subletme.co/subletme-develop/properties/24/1746799358826_4.webp	4	2025-05-09 14:02:39.073963+00
97	25	https://storage.subletme.co/subletme-develop/properties/25/1746799360339_1.jpeg	1	2025-05-09 14:02:41.587425+00
98	25	https://storage.subletme.co/subletme-develop/properties/25/1746799360698_2.jpeg	2	2025-05-09 14:02:41.598732+00
99	25	https://storage.subletme.co/subletme-develop/properties/25/1746799361045_3.jpeg	3	2025-05-09 14:02:41.605429+00
100	25	https://storage.subletme.co/subletme-develop/properties/25/1746799361304_4.jpeg	4	2025-05-09 14:02:41.613181+00
101	26	https://storage.subletme.co/subletme-develop/properties/26/1746799362829_1.webp	1	2025-05-09 14:02:43.9258+00
102	26	https://storage.subletme.co/subletme-develop/properties/26/1746799363084_2.jpeg	2	2025-05-09 14:02:43.940999+00
103	26	https://storage.subletme.co/subletme-develop/properties/26/1746799363384_3.jpeg	3	2025-05-09 14:02:43.945299+00
104	26	https://storage.subletme.co/subletme-develop/properties/26/1746799363648_4.jpeg	4	2025-05-09 14:02:43.947582+00
105	28	https://storage.subletme.co/subletme-develop/properties/28/1746799368273_1.avif	1	2025-05-09 14:02:49.064349+00
106	28	https://storage.subletme.co/subletme-develop/properties/28/1746799368469_2.avif	2	2025-05-09 14:02:49.075995+00
107	28	https://storage.subletme.co/subletme-develop/properties/28/1746799368683_3.avif	3	2025-05-09 14:02:49.081028+00
108	28	https://storage.subletme.co/subletme-develop/properties/28/1746799368863_4.avif	4	2025-05-09 14:02:49.085163+00
109	29	https://storage.subletme.co/subletme-develop/properties/29/1746799370339_1.avif	1	2025-05-09 14:02:51.141246+00
110	29	https://storage.subletme.co/subletme-develop/properties/29/1746799370630_2.avif	2	2025-05-09 14:02:51.154202+00
111	29	https://storage.subletme.co/subletme-develop/properties/29/1746799370810_3.avif	3	2025-05-09 14:02:51.164286+00
112	29	https://storage.subletme.co/subletme-develop/properties/29/1746799370993_4.avif	4	2025-05-09 14:02:51.167822+00
113	30	https://storage.subletme.co/subletme-develop/properties/30/1746799372438_1.avif	1	2025-05-09 14:02:53.213459+00
114	30	https://storage.subletme.co/subletme-develop/properties/30/1746799372574_2.avif	2	2025-05-09 14:02:53.224481+00
115	30	https://storage.subletme.co/subletme-develop/properties/30/1746799372762_3.avif	3	2025-05-09 14:02:53.22952+00
116	30	https://storage.subletme.co/subletme-develop/properties/30/1746799372987_4.avif	4	2025-05-09 14:02:53.232114+00
117	31	https://storage.subletme.co/subletme-develop/properties/31/1746799374407_1.avif	1	2025-05-09 14:02:55.196425+00
118	31	https://storage.subletme.co/subletme-develop/properties/31/1746799374577_2.avif	2	2025-05-09 14:02:55.205163+00
119	31	https://storage.subletme.co/subletme-develop/properties/31/1746799374748_3.avif	3	2025-05-09 14:02:55.210974+00
120	31	https://storage.subletme.co/subletme-develop/properties/31/1746799374950_4.avif	4	2025-05-09 14:02:55.215429+00
121	32	https://storage.subletme.co/subletme-develop/properties/32/1746799376433_1.jpeg	1	2025-05-09 14:02:57.333477+00
122	32	https://storage.subletme.co/subletme-develop/properties/32/1746799376668_2.avif	2	2025-05-09 14:02:57.348267+00
123	32	https://storage.subletme.co/subletme-develop/properties/32/1746799376887_3.avif	3	2025-05-09 14:02:57.350619+00
124	32	https://storage.subletme.co/subletme-develop/properties/32/1746799377126_4.avif	4	2025-05-09 14:02:57.352286+00
125	33	https://storage.subletme.co/subletme-develop/properties/33/1746799378521_1.avif	1	2025-05-09 14:02:59.293185+00
126	33	https://storage.subletme.co/subletme-develop/properties/33/1746799378668_2.avif	2	2025-05-09 14:02:59.30621+00
127	33	https://storage.subletme.co/subletme-develop/properties/33/1746799378860_3.jpeg	3	2025-05-09 14:02:59.309872+00
128	33	https://storage.subletme.co/subletme-develop/properties/33/1746799379083_4.avif	4	2025-05-09 14:02:59.311798+00
129	34	https://storage.subletme.co/subletme-develop/properties/34/1746799380561_1.avif	1	2025-05-09 14:03:01.432018+00
130	34	https://storage.subletme.co/subletme-develop/properties/34/1746799380859_2.avif	2	2025-05-09 14:03:01.434874+00
131	34	https://storage.subletme.co/subletme-develop/properties/34/1746799381019_3.avif	3	2025-05-09 14:03:01.436591+00
132	34	https://storage.subletme.co/subletme-develop/properties/34/1746799381214_4.avif	4	2025-05-09 14:03:01.438155+00
133	35	https://storage.subletme.co/subletme-develop/properties/35/1746799382611_1.avif	1	2025-05-09 14:03:03.458023+00
134	35	https://storage.subletme.co/subletme-develop/properties/35/1746799382830_2.avif	2	2025-05-09 14:03:03.472886+00
135	35	https://storage.subletme.co/subletme-develop/properties/35/1746799383014_3.webp	3	2025-05-09 14:03:03.475604+00
136	35	https://storage.subletme.co/subletme-develop/properties/35/1746799383214_4.avif	4	2025-05-09 14:03:03.477379+00
137	36	https://storage.subletme.co/subletme-develop/properties/36/1746799384734_1.avif	1	2025-05-09 14:03:05.51245+00
138	36	https://storage.subletme.co/subletme-develop/properties/36/1746799384891_2.avif	2	2025-05-09 14:03:05.517836+00
139	36	https://storage.subletme.co/subletme-develop/properties/36/1746799385086_3.avif	3	2025-05-09 14:03:05.523633+00
140	36	https://storage.subletme.co/subletme-develop/properties/36/1746799385305_4.avif	4	2025-05-09 14:03:05.5268+00
141	37	https://storage.subletme.co/subletme-develop/properties/37/1746799386701_1.avif	1	2025-05-09 14:03:07.58367+00
142	37	https://storage.subletme.co/subletme-develop/properties/37/1746799386870_2.avif	2	2025-05-09 14:03:07.597866+00
143	37	https://storage.subletme.co/subletme-develop/properties/37/1746799387089_3.avif	3	2025-05-09 14:03:07.603528+00
144	37	https://storage.subletme.co/subletme-develop/properties/37/1746799387318_4.avif	4	2025-05-09 14:03:07.606425+00
145	38	https://storage.subletme.co/subletme-develop/properties/38/1746799388789_1.avif	1	2025-05-09 14:03:09.759259+00
146	38	https://storage.subletme.co/subletme-develop/properties/38/1746799388936_2.webp	2	2025-05-09 14:03:09.763288+00
147	38	https://storage.subletme.co/subletme-develop/properties/38/1746799389189_3.avif	3	2025-05-09 14:03:09.76532+00
148	38	https://storage.subletme.co/subletme-develop/properties/38/1746799389481_4.avif	4	2025-05-09 14:03:09.775234+00
149	39	https://storage.subletme.co/subletme-develop/properties/39/1746799390947_1.avif	1	2025-05-09 14:03:11.810434+00
150	39	https://storage.subletme.co/subletme-develop/properties/39/1746799391200_2.avif	2	2025-05-09 14:03:11.82283+00
151	39	https://storage.subletme.co/subletme-develop/properties/39/1746799391385_3.avif	3	2025-05-09 14:03:11.824972+00
152	39	https://storage.subletme.co/subletme-develop/properties/39/1746799391614_4.avif	4	2025-05-09 14:03:11.825981+00
153	40	https://storage.subletme.co/subletme-develop/properties/40/1746799392991_1.avif	1	2025-05-09 14:03:13.545518+00
154	40	https://storage.subletme.co/subletme-develop/properties/40/1746799393092_2.avif	2	2025-05-09 14:03:13.54763+00
155	40	https://storage.subletme.co/subletme-develop/properties/40/1746799393231_3.avif	3	2025-05-09 14:03:13.548536+00
156	40	https://storage.subletme.co/subletme-develop/properties/40/1746799393372_4.avif	4	2025-05-09 14:03:13.549225+00
157	41	https://storage.subletme.co/subletme-develop/properties/41/1746799394767_1.avif	1	2025-05-09 14:03:15.357072+00
158	41	https://storage.subletme.co/subletme-develop/properties/41/1746799394907_2.avif	2	2025-05-09 14:03:15.370081+00
159	41	https://storage.subletme.co/subletme-develop/properties/41/1746799395040_3.avif	3	2025-05-09 14:03:15.37413+00
160	41	https://storage.subletme.co/subletme-develop/properties/41/1746799395198_4.avif	4	2025-05-09 14:03:15.375957+00
161	42	https://storage.subletme.co/subletme-develop/properties/42/1746799396552_1.jpeg	1	2025-05-09 14:03:17.388747+00
162	42	https://storage.subletme.co/subletme-develop/properties/42/1746799396762_2.avif	2	2025-05-09 14:03:17.410604+00
163	42	https://storage.subletme.co/subletme-develop/properties/42/1746799396926_3.avif	3	2025-05-09 14:03:17.414203+00
164	42	https://storage.subletme.co/subletme-develop/properties/42/1746799397110_4.webp	4	2025-05-09 14:03:17.41668+00
165	43	https://storage.subletme.co/subletme-develop/properties/43/1746799398860_1.avif	1	2025-05-09 14:03:19.45767+00
166	43	https://storage.subletme.co/subletme-develop/properties/43/1746799398994_2.avif	2	2025-05-09 14:03:19.468768+00
167	43	https://storage.subletme.co/subletme-develop/properties/43/1746799399135_3.avif	3	2025-05-09 14:03:19.475286+00
168	43	https://storage.subletme.co/subletme-develop/properties/43/1746799399315_4.avif	4	2025-05-09 14:03:19.478644+00
169	44	https://storage.subletme.co/subletme-develop/properties/44/1746799400693_1.avif	1	2025-05-09 14:03:22.113792+00
170	44	https://storage.subletme.co/subletme-develop/properties/44/1746799400881_2.webp	2	2025-05-09 14:03:22.132344+00
171	44	https://storage.subletme.co/subletme-develop/properties/44/1746799401685_3.avif	3	2025-05-09 14:03:22.135051+00
172	44	https://storage.subletme.co/subletme-develop/properties/44/1746799401869_4.avif	4	2025-05-09 14:03:22.13654+00
173	45	https://storage.subletme.co/subletme-develop/properties/45/1746799403373_1.avif	1	2025-05-09 14:03:24.011788+00
174	45	https://storage.subletme.co/subletme-develop/properties/45/1746799403556_2.avif	2	2025-05-09 14:03:24.034957+00
175	45	https://storage.subletme.co/subletme-develop/properties/45/1746799403693_3.avif	3	2025-05-09 14:03:24.04008+00
176	45	https://storage.subletme.co/subletme-develop/properties/45/1746799403850_4.avif	4	2025-05-09 14:03:24.041973+00
\.


--
-- Data for Name: property_rules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.property_rules (id, property_id, rule_id, created_at) FROM stdin;
1	1	1	2025-04-01 01:13:42.093085+00
2	1	2	2025-04-01 01:13:42.093085+00
3	1	3	2025-04-01 01:13:42.093085+00
4	2	2	2025-04-01 01:13:44.31078+00
5	2	3	2025-04-01 01:13:44.31078+00
6	3	2	2025-04-01 01:13:46.503884+00
7	4	1	2025-04-01 01:13:49.147467+00
8	4	3	2025-04-01 01:13:49.147467+00
9	5	2	2025-04-01 01:13:51.592381+00
10	5	3	2025-04-01 01:13:51.592381+00
11	6	2	2025-04-01 01:13:53.83135+00
12	6	3	2025-04-01 01:13:53.83135+00
13	7	1	2025-04-01 01:13:56.072251+00
14	7	2	2025-04-01 01:13:56.072251+00
15	7	3	2025-04-01 01:13:56.072251+00
16	8	1	2025-04-01 01:14:00.307498+00
17	9	2	2025-04-01 01:14:02.181316+00
18	9	3	2025-04-01 01:14:02.181316+00
19	10	1	2025-04-01 01:14:04.186092+00
20	10	2	2025-04-01 01:14:04.186092+00
21	11	2	2025-04-01 01:14:05.994548+00
22	11	3	2025-04-01 01:14:05.994548+00
23	12	2	2025-04-01 01:14:08.010952+00
24	12	3	2025-04-01 01:14:08.010952+00
25	13	2	2025-04-01 01:14:10.034743+00
26	14	2	2025-04-01 01:14:12.091427+00
27	14	3	2025-04-01 01:14:12.091427+00
28	15	2	2025-04-01 01:14:14.130917+00
29	15	3	2025-04-01 01:14:14.130917+00
30	16	1	2025-04-01 01:14:15.998504+00
31	16	2	2025-04-01 01:14:15.998504+00
32	16	3	2025-04-01 01:14:15.998504+00
33	17	2	2025-04-01 01:14:18.051413+00
34	17	3	2025-04-01 01:14:18.051413+00
35	18	1	2025-04-01 01:14:19.986912+00
38	20	1	2025-05-09 14:02:27.13936+00
39	20	2	2025-05-09 14:02:27.13936+00
40	20	3	2025-05-09 14:02:27.13936+00
41	21	2	2025-05-09 14:02:29.516609+00
42	21	3	2025-05-09 14:02:29.516609+00
43	22	2	2025-05-09 14:02:32.20521+00
44	23	1	2025-05-09 14:02:35.39349+00
45	23	3	2025-05-09 14:02:35.39349+00
46	24	2	2025-05-09 14:02:37.838704+00
47	24	3	2025-05-09 14:02:37.838704+00
48	25	2	2025-05-09 14:02:40.329682+00
49	25	3	2025-05-09 14:02:40.329682+00
50	26	1	2025-05-09 14:02:42.817137+00
51	26	2	2025-05-09 14:02:42.817137+00
52	26	3	2025-05-09 14:02:42.817137+00
53	28	2	2025-05-09 14:02:48.259627+00
54	28	3	2025-05-09 14:02:48.259627+00
55	29	1	2025-05-09 14:02:50.301972+00
56	29	2	2025-05-09 14:02:50.301972+00
57	30	2	2025-05-09 14:02:52.409926+00
58	30	3	2025-05-09 14:02:52.409926+00
59	31	2	2025-05-09 14:02:54.395847+00
60	31	3	2025-05-09 14:02:54.395847+00
61	32	2	2025-05-09 14:02:56.418586+00
62	33	2	2025-05-09 14:02:58.510171+00
63	33	3	2025-05-09 14:02:58.510171+00
64	34	2	2025-05-09 14:03:00.540138+00
65	34	3	2025-05-09 14:03:00.540138+00
66	35	1	2025-05-09 14:03:02.603968+00
67	35	2	2025-05-09 14:03:02.603968+00
68	35	3	2025-05-09 14:03:02.603968+00
69	36	2	2025-05-09 14:03:04.711646+00
70	36	3	2025-05-09 14:03:04.711646+00
71	37	1	2025-05-09 14:03:06.69417+00
72	38	2	2025-05-09 14:03:08.773247+00
73	38	3	2025-05-09 14:03:08.773247+00
74	39	2	2025-05-09 14:03:10.93333+00
75	39	3	2025-05-09 14:03:10.93333+00
76	40	2	2025-05-09 14:03:12.98015+00
77	40	3	2025-05-09 14:03:12.98015+00
78	41	2	2025-05-09 14:03:14.749319+00
79	42	2	2025-05-09 14:03:16.544324+00
80	42	3	2025-05-09 14:03:16.544324+00
81	43	2	2025-05-09 14:03:18.837069+00
82	44	2	2025-05-09 14:03:20.684328+00
83	44	3	2025-05-09 14:03:20.684328+00
84	45	1	2025-05-09 14:03:23.352456+00
85	45	2	2025-05-09 14:03:23.352456+00
86	45	3	2025-05-09 14:03:23.352456+00
89	19	2	2025-05-13 23:12:15.206662+00
90	19	3	2025-05-13 23:12:15.206662+00
\.


--
-- Data for Name: property_styles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.property_styles (id, property_id, style_id, created_at) FROM stdin;
1	1	4	2025-04-01 01:13:42.090407+00
3	2	2	2025-04-01 01:13:44.31078+00
4	2	4	2025-04-01 01:13:44.31078+00
6	3	2	2025-04-01 01:13:46.503884+00
8	4	1	2025-04-01 01:13:49.147467+00
9	4	3	2025-04-01 01:13:49.147467+00
10	4	6	2025-04-01 01:13:49.147467+00
12	6	2	2025-04-01 01:13:53.83135+00
13	7	1	2025-04-01 01:13:56.072251+00
14	7	4	2025-04-01 01:13:56.072251+00
15	8	1	2025-04-01 01:14:00.307498+00
16	8	2	2025-04-01 01:14:00.307498+00
17	8	3	2025-04-01 01:14:00.307498+00
18	8	6	2025-04-01 01:14:00.307498+00
19	9	2	2025-04-01 01:14:02.181316+00
20	10	1	2025-04-01 01:14:04.186092+00
21	10	4	2025-04-01 01:14:04.186092+00
22	10	6	2025-04-01 01:14:04.186092+00
24	12	4	2025-04-01 01:14:08.010952+00
26	13	2	2025-04-01 01:14:10.034743+00
27	13	4	2025-04-01 01:14:10.034743+00
29	14	1	2025-04-01 01:14:12.091427+00
30	14	2	2025-04-01 01:14:12.091427+00
31	14	4	2025-04-01 01:14:12.091427+00
32	15	4	2025-04-01 01:14:14.130917+00
34	15	6	2025-04-01 01:14:14.130917+00
35	16	1	2025-04-01 01:14:15.998504+00
36	16	3	2025-04-01 01:14:15.998504+00
37	17	2	2025-04-01 01:14:18.051413+00
38	18	3	2025-04-01 01:14:19.986912+00
39	18	4	2025-04-01 01:14:19.986912+00
40	18	6	2025-04-01 01:14:19.986912+00
2	1	1	2025-04-01 01:13:42.090407+00
5	2	1	2025-04-01 01:13:44.31078+00
7	3	1	2025-04-01 01:13:46.503884+00
11	5	1	2025-04-01 01:13:51.592381+00
23	11	1	2025-04-01 01:14:05.994548+00
25	12	1	2025-04-01 01:14:08.010952+00
28	13	1	2025-04-01 01:14:10.034743+00
33	15	1	2025-04-01 01:14:14.130917+00
44	20	4	2025-05-09 14:02:27.13936+00
45	20	5	2025-05-09 14:02:27.13936+00
46	21	2	2025-05-09 14:02:29.516609+00
47	21	4	2025-05-09 14:02:29.516609+00
48	21	5	2025-05-09 14:02:29.516609+00
49	22	2	2025-05-09 14:02:32.20521+00
50	22	5	2025-05-09 14:02:32.20521+00
51	23	1	2025-05-09 14:02:35.39349+00
52	23	3	2025-05-09 14:02:35.39349+00
53	23	6	2025-05-09 14:02:35.39349+00
54	24	5	2025-05-09 14:02:37.838704+00
55	25	2	2025-05-09 14:02:40.329682+00
56	26	1	2025-05-09 14:02:42.817137+00
57	26	4	2025-05-09 14:02:42.817137+00
58	28	2	2025-05-09 14:02:48.259627+00
59	29	1	2025-05-09 14:02:50.301972+00
60	29	4	2025-05-09 14:02:50.301972+00
61	29	6	2025-05-09 14:02:50.301972+00
62	30	5	2025-05-09 14:02:52.409926+00
63	31	4	2025-05-09 14:02:54.395847+00
64	31	5	2025-05-09 14:02:54.395847+00
65	32	2	2025-05-09 14:02:56.418586+00
66	32	4	2025-05-09 14:02:56.418586+00
67	32	5	2025-05-09 14:02:56.418586+00
68	33	1	2025-05-09 14:02:58.510171+00
69	33	2	2025-05-09 14:02:58.510171+00
70	33	4	2025-05-09 14:02:58.510171+00
71	34	4	2025-05-09 14:03:00.540138+00
72	34	5	2025-05-09 14:03:00.540138+00
73	34	6	2025-05-09 14:03:00.540138+00
74	35	1	2025-05-09 14:03:02.603968+00
75	35	3	2025-05-09 14:03:02.603968+00
76	36	2	2025-05-09 14:03:04.711646+00
77	37	3	2025-05-09 14:03:06.69417+00
78	37	4	2025-05-09 14:03:06.69417+00
79	37	6	2025-05-09 14:03:06.69417+00
80	38	2	2025-05-09 14:03:08.773247+00
81	38	4	2025-05-09 14:03:08.773247+00
82	38	5	2025-05-09 14:03:08.773247+00
83	39	2	2025-05-09 14:03:10.93333+00
84	39	4	2025-05-09 14:03:10.93333+00
85	40	2	2025-05-09 14:03:12.98015+00
86	40	4	2025-05-09 14:03:12.98015+00
87	40	5	2025-05-09 14:03:12.98015+00
88	41	1	2025-05-09 14:03:14.749319+00
89	41	2	2025-05-09 14:03:14.749319+00
90	42	4	2025-05-09 14:03:16.544324+00
91	42	5	2025-05-09 14:03:16.544324+00
92	43	2	2025-05-09 14:03:18.837069+00
93	43	4	2025-05-09 14:03:18.837069+00
94	44	4	2025-05-09 14:03:20.684328+00
95	44	5	2025-05-09 14:03:20.684328+00
96	44	6	2025-05-09 14:03:20.684328+00
97	45	1	2025-05-09 14:03:23.352456+00
98	45	2	2025-05-09 14:03:23.352456+00
99	45	4	2025-05-09 14:03:23.352456+00
103	19	2	2025-05-13 23:12:15.206662+00
104	19	4	2025-05-13 23:12:15.206662+00
105	19	1	2025-05-13 23:12:15.206662+00
\.


--
-- Data for Name: property_swipe_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.property_swipe_history (id, user_id, property_id, created_at, action) FROM stdin;
54	1	45	2025-05-09 14:16:32.866762+00	like
55	1	44	2025-05-09 14:16:34.329409+00	like
56	1	43	2025-05-09 14:29:33.794001+00	like
57	4	19	2025-05-18 22:34:17.416446+00	like
58	4	19	2025-05-18 22:57:52.278944+00	like
59	4	18	2025-05-19 00:12:28.542258+00	like
\.


--
-- Data for Name: property_swipes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.property_swipes (id, user_id, property_id, hide_until, created_at, status, updated_at) FROM stdin;
58	4	19	\N	2025-05-18 22:57:52.278944+00	approved	2025-05-18 23:12:34.42525+00
59	4	18	\N	2025-05-19 00:12:28.542258+00	approved	2025-05-19 00:13:03.81811+00
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reviews (id, property_id, user_id, rating, comment, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: rules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.rules (id, name, icon, created_at) FROM stdin;
1	Pets	pets	2025-04-01 01:12:37.540889+00
2	Smoking	smoking	2025-04-01 01:12:37.540889+00
3	Noise at night	noise_at_night	2025-04-01 01:12:37.540889+00
\.


--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- Data for Name: states; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.states (id, country_id, name, code) FROM stdin;
1	1	Florida	FL
2	1	New York	NY
\.


--
-- Data for Name: styles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.styles (id, name, icon, created_at) FROM stdin;
1	Peaceful	peaceful	2025-04-01 01:12:37.536883+00
2	Unique	unique	2025-04-01 01:12:37.536883+00
3	Family-friendly	family-friendly	2025-04-01 01:12:37.536883+00
4	Stylish	stylish	2025-04-01 01:12:37.536883+00
5	Central	central	2025-04-01 01:12:37.536883+00
6	Spacious	spacious	2025-04-01 01:12:37.536883+00
\.


--
-- Data for Name: user_firebase_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_firebase_tokens (id, user_id, firebase_token, device_metadata, created_at, updated_at) FROM stdin;
1	1	000000000000000000000000000000000000000000000000000000000000000	{"model": "One Plus 8", "osVersion": "13", "appVersion": "1.0.1", "manufacturer": "One Plus"}	2025-04-16 15:02:42.978636	2025-04-16 15:04:37.793844
3	2	fJHlzXOY9E9GsALnd7OdUG:APA91bFpo-TeJCzF3fLNRKxdWgmKDsBXjDPxcyZ5pMRhHJqK2YbJCAQ0wP8ScTya5I9cTOVmEIRItY8I2efdj6S7AlABsU-rLoHMrRM3tZz83_3dzlX-31g	{"device_id": "D0B3FDF7-0159-4411-8DEB-AD2AB28DC80A", "app_version": "1.0.23+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-04-28 11:57:10.980253	2025-04-28 11:57:10.980253
4	2	f4nKpINbqkdZsekuRQKAdH:APA91bFkssGDNWSGuOE11buKgEAt_rQj4dvqXCB1HBio7D2DxGM99w8PLIbRZVpHpzuO9YYH76V_OdkFHI9CZzPeYa71PQrFhZcxQJDLYKjTOM8Rc8Q1fWA	{"device_id": "FB8D491F-F596-482B-ADED-FEDACD4C71E0", "app_version": "1.0.23+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-04-28 12:14:39.562785	2025-04-28 12:14:39.562785
5	2	evGnkB7s3EKvmChwmTkdYN:APA91bFbiNrIfmBM1P23vAIXOGqbyDFN0a06FZWBQ3LAf_QE_t0mTlQJ3nQhZhgcQz_hLk4H2dkpCcO4xiSOHnlPQUhRWXpEq5Doi2ucieVMavWWbquxrTA	{"device_id": "CFA74E0F-DF33-463E-80BA-99D65468C3CB", "app_version": "1.0.24+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-04-28 14:12:55.256742	2025-04-28 15:26:42.21339
21	1	e96jVutHeE7IjLg714Rdor:APA91bF3QOFDegELklneuMcNvSf3QcNFBWyxHlu9Eg7HLM1OQrHQ91-UGnrlxsvWqF-0q4b2VLgKADKtTacUKzLAIVJtqDbOiV_wi3ZSkqJKHSwcgubVK7Y	{"device_id": "EF06651D-0C81-4530-96F9-E7D6B80F7416", "app_version": "1.0.35+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-01 19:57:28.387278	2025-05-01 20:17:36.137932
27	2	e96jVutHeE7IjLg714Rdor:APA91bF3QOFDegELklneuMcNvSf3QcNFBWyxHlu9Eg7HLM1OQrHQ91-UGnrlxsvWqF-0q4b2VLgKADKtTacUKzLAIVJtqDbOiV_wi3ZSkqJKHSwcgubVK7Y	{"device_id": "EF06651D-0C81-4530-96F9-E7D6B80F7416", "app_version": "1.0.35+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-01 20:21:34.957127	2025-05-01 20:21:34.957127
28	4	dwmZjRh7MUNDgnQhoffRQs:APA91bHSzO8Pyx_hysKoGAFaffnNlbO35vtAEhvw050Xbt9bch-6YIOPG3kKKSzGAsKl8MfMN1WtXyYvVsSFvjveX-ElJT8Ngo3x_0zLfMP5l2OkRyA3q58	{"device_id": "682E690B-C08A-4BEC-91C1-29DCC17D1B62", "app_version": "1.0.48+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-08 22:18:15.209542	2025-05-09 14:43:02.566134
56	1	dwmZjRh7MUNDgnQhoffRQs:APA91bHSzO8Pyx_hysKoGAFaffnNlbO35vtAEhvw050Xbt9bch-6YIOPG3kKKSzGAsKl8MfMN1WtXyYvVsSFvjveX-ElJT8Ngo3x_0zLfMP5l2OkRyA3q58	{"device_id": "682E690B-C08A-4BEC-91C1-29DCC17D1B62", "app_version": "1.0.48+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-09 14:06:33.707195	2025-05-09 14:50:05.270461
34	2	dwmZjRh7MUNDgnQhoffRQs:APA91bHSzO8Pyx_hysKoGAFaffnNlbO35vtAEhvw050Xbt9bch-6YIOPG3kKKSzGAsKl8MfMN1WtXyYvVsSFvjveX-ElJT8Ngo3x_0zLfMP5l2OkRyA3q58	{"device_id": "682E690B-C08A-4BEC-91C1-29DCC17D1B62", "app_version": "1.0.45+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-09 00:18:50.717957	2025-05-09 00:18:50.717957
35	5	dwmZjRh7MUNDgnQhoffRQs:APA91bHSzO8Pyx_hysKoGAFaffnNlbO35vtAEhvw050Xbt9bch-6YIOPG3kKKSzGAsKl8MfMN1WtXyYvVsSFvjveX-ElJT8Ngo3x_0zLfMP5l2OkRyA3q58	{"device_id": "682E690B-C08A-4BEC-91C1-29DCC17D1B62", "app_version": "1.0.47+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-09 00:52:05.443973	2025-05-09 00:52:05.443973
60	2	eEw5qHFLQUB_pnpetqoqx2:APA91bHxF9Eyw7WOG8CRsmVFM_P89YukrA9JmmoVQ9yUagdQpbfgsss60GUYWdcmvWbxaHYyK69fnXCuYsfMO3BCR5yUo5-3gISxhRsCSD3K2u1sioUFa40	{"device_id": "6CD72279-6C0C-49FA-8804-A10E0B5F3666", "app_version": "1.0.51+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-13 20:57:15.404761	2025-05-13 23:10:34.025741
73	4	fg0R7InrF0meg3-UQuRuDB:APA91bEY19GrHkVYSRXG_jzQ8FoS9jP9BPrBytBAqzTjNbR4W3GM5yvvNnNg6SZpwoIoxkrilbY-QvnxfocOjc7v7beaqCeaG5-4pqC97Je_87XjTSDRzAc	{"device_id": "947A22E3-BCA7-4DD0-8ECD-63FBB225365E", "app_version": "1.0.52+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-15 15:56:56.691162	2025-05-15 20:16:03.997209
106	2	eYWT33Bqw059hDZtDwczM2:APA91bFAL5gqwmnVg16HAGlKGd5ow5DKbmGQOisArH1PRDC_E08jW1nXRdvTjz6vNBPQK4pxgzk7SiXt1RgXMoVpgMuQisCjcnoEr-LEZArqtxwBjUBgnpg	{"device_id": "98B1B11F-9BF7-4D47-9194-277224334815", "app_version": "1.0.56+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-18 22:34:37.127045	2025-05-18 22:58:41.295736
100	4	eYWT33Bqw059hDZtDwczM2:APA91bFAL5gqwmnVg16HAGlKGd5ow5DKbmGQOisArH1PRDC_E08jW1nXRdvTjz6vNBPQK4pxgzk7SiXt1RgXMoVpgMuQisCjcnoEr-LEZArqtxwBjUBgnpg	{"device_id": "98B1B11F-9BF7-4D47-9194-277224334815", "app_version": "1.0.56+1", "device_type": "ios", "device_brand": "Apple", "device_model": "iPhone"}	2025-05-18 22:16:36.032828	2025-05-18 23:13:00.919095
112	4	cBLuz83WStaVBhCO_RebxU:APA91bHKOHL7VjvWrbne24JVSbsggPOzNOR77lAOGxhvAbRJ6UdrbPNY8WPgZLa4gRMu0CkJq78ncMRxe3gGtO09reMiz5VW3RRDVY7tlC7zt5Zm_ZcdFvQ	{"device_id": "RP1A.201005.004.A1", "app_version": "1.0.57+1", "device_type": "android", "device_brand": "google", "device_model": "Pixel 2 XL"}	2025-05-18 23:53:39.061265	2025-05-19 01:13:41.296653
115	2	cBLuz83WStaVBhCO_RebxU:APA91bHKOHL7VjvWrbne24JVSbsggPOzNOR77lAOGxhvAbRJ6UdrbPNY8WPgZLa4gRMu0CkJq78ncMRxe3gGtO09reMiz5VW3RRDVY7tlC7zt5Zm_ZcdFvQ	{"device_id": "RP1A.201005.004.A1", "app_version": "1.0.57+1", "device_type": "android", "device_brand": "google", "device_model": "Pixel 2 XL"}	2025-05-19 00:12:58.741846	2025-05-19 01:19:01.676421
\.


--
-- Data for Name: user_modal_views; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_modal_views (id, user_id, helper_modal_id, viewed_at) FROM stdin;
2	4	1	2025-05-15 18:34:30.694097
3	2	1	2025-05-18 22:36:19.282368
\.


--
-- Data for Name: user_photos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_photos (id, user_id, photo_url, is_profile, display_order, created_at, updated_at) FROM stdin;
1	1	https://storage.subletme.co/subletme-develop/users/1/profile.jpeg	t	1	2025-05-08 21:31:54.488712	2025-05-08 21:31:54.488712
2	2	https://storage.subletme.co/subletme-develop/users/2/profile.jpeg	t	1	2025-05-08 21:31:54.488712	2025-05-08 21:31:54.488712
4	4	https://storage.subletme.co/subletme-develop/users/4/1746742670537_photo_1746742670537.jpeg	f	2	2025-05-08 22:17:50.753159	2025-05-08 22:17:50.753159
5	4	https://storage.subletme.co/subletme-develop/users/4/1746749804802_photo_1746749804801_0.jpeg	f	3	2025-05-08 22:17:50.995395	2025-05-09 00:16:45.300181
6	4	https://storage.subletme.co/subletme-develop/users/4/1746742671007_photo_1746742671006.jpeg	f	4	2025-05-08 22:17:51.482909	2025-05-08 22:17:51.482909
7	4	https://storage.subletme.co/subletme-develop/users/4/1746742671491_photo_1746742671491.jpeg	f	5	2025-05-08 22:17:51.811039	2025-05-08 22:17:51.811039
8	4	https://storage.subletme.co/subletme-develop/users/4/1746742671826_photo_1746742671826.jpeg	f	6	2025-05-08 22:17:52.072369	2025-05-08 22:17:52.072369
3	4	https://storage.subletme.co/subletme-develop/users/4/1746749893637_photo_1746749893637_0.jpeg	t	1	2025-05-08 22:17:50.50364	2025-05-09 00:18:21.173199
9	2	https://storage.subletme.co/subletme-develop/users/2/1746749961116_photo_1746749961115_0.jpeg	f	5	2025-05-09 00:19:21.545382	2025-05-09 00:19:21.545382
10	2	https://storage.subletme.co/subletme-develop/users/2/1746750003649_photo_1746750003647_0.jpeg	f	2	2025-05-09 00:20:04.056448	2025-05-09 00:20:04.056448
11	2	https://storage.subletme.co/subletme-develop/users/2/1746750004064_photo_1746750004064_1.jpeg	f	3	2025-05-09 00:20:04.316121	2025-05-09 00:20:04.316121
12	2	https://storage.subletme.co/subletme-develop/users/2/1746750004327_photo_1746750004326_2.jpeg	f	4	2025-05-09 00:20:04.605481	2025-05-09 00:20:04.605481
13	2	https://storage.subletme.co/subletme-develop/users/2/1746750004615_photo_1746750004613_3.jpeg	f	6	2025-05-09 00:20:04.841444	2025-05-09 00:20:04.841444
14	5	https://storage.subletme.co/subletme-develop/users/5/1746751916321_photo_1746751916320.jpeg	t	1	2025-05-09 00:51:56.756032	2025-05-09 00:51:56.756032
15	5	https://storage.subletme.co/subletme-develop/users/5/1746751916785_photo_1746751916785.jpeg	f	2	2025-05-09 00:51:56.993065	2025-05-09 00:51:56.993065
16	5	https://storage.subletme.co/subletme-develop/users/5/1746751916997_photo_1746751916997.jpeg	f	3	2025-05-09 00:51:57.221598	2025-05-09 00:51:57.221598
17	5	https://storage.subletme.co/subletme-develop/users/5/1746751917230_photo_1746751917230.jpeg	f	4	2025-05-09 00:51:57.562806	2025-05-09 00:51:57.562806
18	5	https://storage.subletme.co/subletme-develop/users/5/1746751917570_photo_1746751917570.jpeg	f	5	2025-05-09 00:51:57.784195	2025-05-09 00:51:57.784195
19	5	https://storage.subletme.co/subletme-develop/users/5/1746751917792_photo_1746751917792.jpeg	f	6	2025-05-09 00:51:58.025149	2025-05-09 00:51:58.025149
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, first_name, last_name, language, location, hash_password, date_of_birth, photo_url, bio, gender, refresh_token, onboarding_step, google_id, apple_id, platform, location_updated_at, created_at, updated_at, address, instagram_username, facebook_username) FROM stdin;
1	sam@test.com	Sam	Altman	en	0101000020E6100000C169FE93CA4153C0858C2783EA844340	$2b$10$QDzO5/dcSzuqouKL/A5/k.0SJ8edbPPZ8NspQ39CCzPKk2joBPxEi	2007-02-07	https://storage.subletme.co/subletme-develop/users/1/profile.jpeg	\N	\N	\N	completed	\N	\N	ios	2025-05-09 14:50:05.514565	2025-04-01 01:12:41.076939	2025-05-09 14:50:05.514565	{"city": "Silver Spring", "country": "United States", "formatted_address": "1121 University Blvd W, Silver Spring, MD 20902, USA"}	\N	\N
3	jerome@test.com	jerome	test	en	\N	$2b$10$QDzO5/dcSzuqouKL/A5/k.0SJ8edbPPZ8NspQ39CCzPKk2joBPxEi	2007-05-01	\N	\N	\N	\N	phone_verification	\N	\N	ios	2025-05-08 20:42:24.360567	2025-05-08 20:42:24.360567	2025-05-08 20:42:24.360567	\N	\N	\N
5	jeff@test.com	jeff	bezoa	en	0101000020E6100000C169FE93CA4153C0858C2783EA844340	$2b$10$QDzO5/dcSzuqouKL/A5/k.0SJ8edbPPZ8NspQ39CCzPKk2joBPxEi	2007-03-14	\N	\N	\N	\N	completed	\N	\N	ios	2025-05-09 00:52:05.825888	2025-05-09 00:45:18.508259	2025-05-09 00:52:05.825888	{"city": "Silver Spring", "country": "United States", "formatted_address": "1121 University Blvd W, Silver Spring, MD 20902, USA"}	\N	\N
6	jensen@test.com	jensen	test	en	\N	$2b$10$QDzO5/dcSzuqouKL/A5/k.0SJ8edbPPZ8NspQ39CCzPKk2joBPxEi	2006-10-18	\N	\N	\N	\N	photo_upload	\N	\N	ios	2025-05-09 01:00:30.483859	2025-05-09 01:00:30.483859	2025-05-09 01:00:30.483859	\N	\N	\N
4	donald@test.com	eldonaldo	test	en	0101000020E61000006E6EA708CB4153C0DC03BEECE8844340	$2b$10$QDzO5/dcSzuqouKL/A5/k.0SJ8edbPPZ8NspQ39CCzPKk2joBPxEi	2007-05-07	\N	\N	male	\N	completed	\N	\N	ios	2025-05-19 01:13:44.395481	2025-05-08 21:11:59.912832	2025-05-19 01:13:44.395481	{"city": "Silver Spring", "country": "United States", "formatted_address": "1121 University Blvd W, Silver Spring, MD 20902, USA"}	sonaldo	\N
2	elon@test.com	Elon	Musk	en	0101000020E6100000A4AF7B86CB4153C00B6EB598E9844340	$2b$10$QDzO5/dcSzuqouKL/A5/k.0SJ8edbPPZ8NspQ39CCzPKk2joBPxEi	2007-02-07	https://storage.subletme.co/subletme-develop/users/2/profile.jpeg	\N	male	\N	completed	\N	\N	ios	2025-05-19 01:19:03.682641	2025-04-01 01:12:59.976244	2025-05-19 01:19:03.682641	{"city": "Silver Spring", "country": "United States", "formatted_address": "1121 University Blvd W, Silver Spring, MD 20902, USA"}	\N	\N
\.


--
-- Data for Name: verification_codes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.verification_codes (id, contact_verification_id, code, expires_at, attempts, is_used, created_at, updated_at) FROM stdin;
3	3	2762	2026-05-08 20:40:34.962911	2	t	2025-05-08 20:40:34.962911	2025-05-08 20:40:34.962911
4	4	9902	2026-05-08 21:02:54.160218	5	t	2025-05-08 21:02:54.160218	2025-05-08 21:02:54.160218
5	5	1934	2026-05-08 21:19:03.838103	0	f	2025-05-08 21:19:03.838103	2025-05-08 21:19:03.838103
6	6	3400	2026-05-09 00:44:55.8977	1	t	2025-05-09 00:44:55.8977	2025-05-09 00:44:55.8977
7	7	8612	2026-05-09 00:45:25.873958	0	f	2025-05-09 00:45:25.873958	2025-05-09 00:45:25.873958
8	8	9258	2026-05-09 00:53:06.851558	1	t	2025-05-09 00:53:06.851558	2025-05-09 00:53:06.851558
9	9	2677	2026-05-09 01:00:38.165432	0	f	2025-05-09 01:00:38.165432	2025-05-09 01:00:38.165432
\.


--
-- Data for Name: geocode_settings; Type: TABLE DATA; Schema: tiger; Owner: postgres
--

COPY tiger.geocode_settings (name, setting, unit, category, short_desc) FROM stdin;
\.


--
-- Data for Name: pagc_gaz; Type: TABLE DATA; Schema: tiger; Owner: postgres
--

COPY tiger.pagc_gaz (id, seq, word, stdword, token, is_custom) FROM stdin;
\.


--
-- Data for Name: pagc_lex; Type: TABLE DATA; Schema: tiger; Owner: postgres
--

COPY tiger.pagc_lex (id, seq, word, stdword, token, is_custom) FROM stdin;
\.


--
-- Data for Name: pagc_rules; Type: TABLE DATA; Schema: tiger; Owner: postgres
--

COPY tiger.pagc_rules (id, rule, is_custom) FROM stdin;
\.


--
-- Data for Name: topology; Type: TABLE DATA; Schema: topology; Owner: postgres
--

COPY topology.topology (id, name, srid, "precision", hasz) FROM stdin;
\.


--
-- Data for Name: layer; Type: TABLE DATA; Schema: topology; Owner: postgres
--

COPY topology.layer (topology_id, layer_id, schema_name, table_name, feature_column, feature_type, level, child_id) FROM stdin;
\.


--
-- Name: amenities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.amenities_id_seq', 11, true);


--
-- Name: app_version_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.app_version_id_seq', 2, true);


--
-- Name: availability_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.availability_id_seq', 1, false);


--
-- Name: cities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cities_id_seq', 21, true);


--
-- Name: contact_verifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.contact_verifications_id_seq', 9, true);


--
-- Name: conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.conversations_id_seq', 1, true);


--
-- Name: countries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.countries_id_seq', 2, true);


--
-- Name: helper_modals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.helper_modals_id_seq', 1, true);


--
-- Name: host_subletter_swipes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.host_subletter_swipes_id_seq', 3, true);


--
-- Name: locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.locations_id_seq', 45, true);


--
-- Name: messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.messages_id_seq', 2, true);


--
-- Name: otp_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.otp_id_seq', 1, false);


--
-- Name: place_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.place_types_id_seq', 8, true);


--
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.properties_id_seq', 45, true);


--
-- Name: property_amenities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.property_amenities_id_seq', 260, true);


--
-- Name: property_dates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.property_dates_id_seq', 44, true);


--
-- Name: property_photos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.property_photos_id_seq', 176, true);


--
-- Name: property_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.property_rules_id_seq', 90, true);


--
-- Name: property_styles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.property_styles_id_seq', 105, true);


--
-- Name: property_swipe_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.property_swipe_history_id_seq', 59, true);


--
-- Name: property_swipes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.property_swipes_id_seq', 59, true);


--
-- Name: reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reviews_id_seq', 1, false);


--
-- Name: rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.rules_id_seq', 3, true);


--
-- Name: states_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.states_id_seq', 2, true);


--
-- Name: styles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.styles_id_seq', 6, true);


--
-- Name: user_firebase_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_firebase_tokens_id_seq', 129, true);


--
-- Name: user_modal_views_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_modal_views_id_seq', 3, true);


--
-- Name: user_photos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_photos_id_seq', 19, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 6, true);


--
-- Name: verification_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.verification_codes_id_seq', 9, true);


--
-- Name: topology_id_seq; Type: SEQUENCE SET; Schema: topology; Owner: postgres
--

SELECT pg_catalog.setval('topology.topology_id_seq', 1, false);


--
-- Name: amenities amenities_icon_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.amenities
    ADD CONSTRAINT amenities_icon_key UNIQUE (icon);


--
-- Name: amenities amenities_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.amenities
    ADD CONSTRAINT amenities_name_key UNIQUE (name);


--
-- Name: amenities amenities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.amenities
    ADD CONSTRAINT amenities_pkey PRIMARY KEY (id);


--
-- Name: app_version app_version_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_version
    ADD CONSTRAINT app_version_pkey PRIMARY KEY (id);


--
-- Name: availability availability_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_pkey PRIMARY KEY (id);


--
-- Name: cities cities_country_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_country_id_name_key UNIQUE (country_id, name);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: contact_verifications contact_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_verifications
    ADD CONSTRAINT contact_verifications_pkey PRIMARY KEY (id);


--
-- Name: contact_verifications contact_verifications_user_id_verification_type_contact_val_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_verifications
    ADD CONSTRAINT contact_verifications_user_id_verification_type_contact_val_key UNIQUE (user_id, verification_type, contact_value);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: countries countries_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_code_key UNIQUE (code);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (id);


--
-- Name: helper_modals helper_modals_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helper_modals
    ADD CONSTRAINT helper_modals_code_key UNIQUE (code);


--
-- Name: helper_modals helper_modals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.helper_modals
    ADD CONSTRAINT helper_modals_pkey PRIMARY KEY (id);


--
-- Name: host_subletter_swipes host_subletter_swipes_host_id_subletter_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.host_subletter_swipes
    ADD CONSTRAINT host_subletter_swipes_host_id_subletter_id_key UNIQUE (host_id, subletter_id);


--
-- Name: host_subletter_swipes host_subletter_swipes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.host_subletter_swipes
    ADD CONSTRAINT host_subletter_swipes_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: otp otp_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp
    ADD CONSTRAINT otp_pkey PRIMARY KEY (id);


--
-- Name: place_types place_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.place_types
    ADD CONSTRAINT place_types_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_amenities property_amenities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_amenities
    ADD CONSTRAINT property_amenities_pkey PRIMARY KEY (id);


--
-- Name: property_amenities property_amenities_property_id_amenity_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_amenities
    ADD CONSTRAINT property_amenities_property_id_amenity_id_key UNIQUE (property_id, amenity_id);


--
-- Name: property_dates property_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_dates
    ADD CONSTRAINT property_dates_pkey PRIMARY KEY (id);


--
-- Name: property_photos property_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_photos
    ADD CONSTRAINT property_photos_pkey PRIMARY KEY (id);


--
-- Name: property_rules property_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_rules
    ADD CONSTRAINT property_rules_pkey PRIMARY KEY (id);


--
-- Name: property_rules property_rules_property_id_rule_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_rules
    ADD CONSTRAINT property_rules_property_id_rule_id_key UNIQUE (property_id, rule_id);


--
-- Name: property_styles property_styles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_styles
    ADD CONSTRAINT property_styles_pkey PRIMARY KEY (id);


--
-- Name: property_styles property_styles_property_id_style_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_styles
    ADD CONSTRAINT property_styles_property_id_style_id_key UNIQUE (property_id, style_id);


--
-- Name: property_swipe_history property_swipe_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_swipe_history
    ADD CONSTRAINT property_swipe_history_pkey PRIMARY KEY (id);


--
-- Name: property_swipes property_swipes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_swipes
    ADD CONSTRAINT property_swipes_pkey PRIMARY KEY (id);


--
-- Name: property_swipes property_swipes_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_swipes
    ADD CONSTRAINT property_swipes_user_id_property_id_key UNIQUE (user_id, property_id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: rules rules_icon_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_icon_key UNIQUE (icon);


--
-- Name: rules rules_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_name_key UNIQUE (name);


--
-- Name: rules rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rules
    ADD CONSTRAINT rules_pkey PRIMARY KEY (id);


--
-- Name: states states_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_pkey PRIMARY KEY (id);


--
-- Name: styles styles_icon_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles
    ADD CONSTRAINT styles_icon_key UNIQUE (icon);


--
-- Name: styles styles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles
    ADD CONSTRAINT styles_name_key UNIQUE (name);


--
-- Name: styles styles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.styles
    ADD CONSTRAINT styles_pkey PRIMARY KEY (id);


--
-- Name: property_photos unique_property_photo_order; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_photos
    ADD CONSTRAINT unique_property_photo_order UNIQUE (property_id, display_order);


--
-- Name: user_photos unique_user_display_order; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_photos
    ADD CONSTRAINT unique_user_display_order UNIQUE (user_id, display_order);


--
-- Name: reviews unique_user_property_review; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT unique_user_property_review UNIQUE (user_id, property_id);


--
-- Name: user_firebase_tokens user_firebase_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_firebase_tokens
    ADD CONSTRAINT user_firebase_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_firebase_tokens user_firebase_tokens_user_id_firebase_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_firebase_tokens
    ADD CONSTRAINT user_firebase_tokens_user_id_firebase_token_key UNIQUE (user_id, firebase_token);


--
-- Name: user_modal_views user_modal_views_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_modal_views
    ADD CONSTRAINT user_modal_views_pkey PRIMARY KEY (id);


--
-- Name: user_modal_views user_modal_views_user_id_helper_modal_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_modal_views
    ADD CONSTRAINT user_modal_views_user_id_helper_modal_id_key UNIQUE (user_id, helper_modal_id);


--
-- Name: user_photos user_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_photos
    ADD CONSTRAINT user_photos_pkey PRIMARY KEY (id);


--
-- Name: users users_apple_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_apple_id_key UNIQUE (apple_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verification_codes verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.verification_codes
    ADD CONSTRAINT verification_codes_pkey PRIMARY KEY (id);


--
-- Name: idx_app_version_environment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_app_version_environment ON public.app_version USING btree (environment);


--
-- Name: idx_apple_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_apple_id ON public.users USING btree (apple_id);


--
-- Name: idx_availability_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_availability_dates ON public.availability USING btree (property_id, start_date, end_date);


--
-- Name: idx_availability_price; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_availability_price ON public.availability USING btree (price_per_night);


--
-- Name: idx_availability_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_availability_property_id ON public.availability USING btree (property_id);


--
-- Name: idx_cities_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cities_country ON public.cities USING btree (country_id);


--
-- Name: idx_contact_verifications_type_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_verifications_type_value ON public.contact_verifications USING btree (verification_type, contact_value);


--
-- Name: idx_contact_verifications_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_verifications_user_id ON public.contact_verifications USING btree (user_id);


--
-- Name: idx_conversations_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversations_property_id ON public.conversations USING btree (property_id);


--
-- Name: idx_conversations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversations_user_id ON public.conversations USING btree (user_id);


--
-- Name: idx_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email ON public.users USING btree (email);


--
-- Name: idx_google_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_google_id ON public.users USING btree (google_id);


--
-- Name: idx_helper_modals_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_helper_modals_code ON public.helper_modals USING btree (code);


--
-- Name: idx_helper_modals_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_helper_modals_is_active ON public.helper_modals USING btree (is_active);


--
-- Name: idx_host_subletter_swipes_host_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_host_subletter_swipes_host_id ON public.host_subletter_swipes USING btree (host_id);


--
-- Name: idx_host_subletter_swipes_host_subletter; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_host_subletter_swipes_host_subletter ON public.host_subletter_swipes USING btree (host_id, subletter_id);


--
-- Name: idx_host_subletter_swipes_subletter_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_host_subletter_swipes_subletter_id ON public.host_subletter_swipes USING btree (subletter_id);


--
-- Name: idx_locations_city; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_locations_city ON public.locations USING btree (city_id);


--
-- Name: idx_locations_coordinates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_locations_coordinates ON public.locations USING gist (coordinates);


--
-- Name: idx_messages_conversation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);


--
-- Name: idx_messages_read_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_read_at ON public.messages USING btree (read_at);


--
-- Name: idx_messages_sender_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);


--
-- Name: idx_messages_sent_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_sent_at ON public.messages USING btree (sent_at);


--
-- Name: idx_otp_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otp_email ON public.otp USING btree (email);


--
-- Name: idx_otp_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otp_expires_at ON public.otp USING btree (expires_at);


--
-- Name: idx_properties_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_properties_created_at ON public.properties USING btree (created_at);


--
-- Name: idx_properties_host_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_properties_host_id ON public.properties USING btree (host_id);


--
-- Name: idx_properties_location_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_properties_location_id ON public.properties USING btree (location_id);


--
-- Name: idx_properties_place_type_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_properties_place_type_id ON public.properties USING btree (place_type_id);


--
-- Name: idx_properties_title; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_properties_title ON public.properties USING gin (to_tsvector('english'::regconfig, (title)::text));


--
-- Name: idx_property_amenities_amenity_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_amenities_amenity_id ON public.property_amenities USING btree (amenity_id);


--
-- Name: idx_property_amenities_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_amenities_property_id ON public.property_amenities USING btree (property_id);


--
-- Name: idx_property_dates_date_range; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_dates_date_range ON public.property_dates USING btree (start_date, end_date);


--
-- Name: idx_property_dates_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_dates_property_id ON public.property_dates USING btree (property_id);


--
-- Name: idx_property_photos_display_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_photos_display_order ON public.property_photos USING btree (property_id, display_order);


--
-- Name: idx_property_photos_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_photos_property_id ON public.property_photos USING btree (property_id);


--
-- Name: idx_property_rules_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_rules_property_id ON public.property_rules USING btree (property_id);


--
-- Name: idx_property_rules_rule_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_rules_rule_id ON public.property_rules USING btree (rule_id);


--
-- Name: idx_property_styles_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_styles_property_id ON public.property_styles USING btree (property_id);


--
-- Name: idx_property_styles_style_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_styles_style_id ON public.property_styles USING btree (style_id);


--
-- Name: idx_property_swipe_history_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_swipe_history_action ON public.property_swipe_history USING btree (action);


--
-- Name: idx_property_swipe_history_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_swipe_history_property_id ON public.property_swipe_history USING btree (property_id);


--
-- Name: idx_property_swipe_history_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_swipe_history_user_id ON public.property_swipe_history USING btree (user_id);


--
-- Name: idx_property_swipes_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_swipes_property_id ON public.property_swipes USING btree (property_id);


--
-- Name: idx_property_swipes_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_swipes_status ON public.property_swipes USING btree (status);


--
-- Name: idx_property_swipes_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_property_swipes_user_id ON public.property_swipes USING btree (user_id);


--
-- Name: idx_reviews_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reviews_property_id ON public.reviews USING btree (property_id);


--
-- Name: idx_reviews_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reviews_user_id ON public.reviews USING btree (user_id);


--
-- Name: idx_user_modal_views_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_modal_views_user_id ON public.user_modal_views USING btree (user_id);


--
-- Name: idx_user_photos_profile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_photos_profile ON public.user_photos USING btree (user_id, is_profile);


--
-- Name: idx_user_photos_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_photos_user_id ON public.user_photos USING btree (user_id);


--
-- Name: idx_users_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_address ON public.users USING gin (address);


--
-- Name: idx_verification_codes_contact_verification_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_verification_codes_contact_verification_id ON public.verification_codes USING btree (contact_verification_id);


--
-- Name: users_location_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_location_idx ON public.users USING gist (location);


--
-- Name: properties reset_property_hide_until_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER reset_property_hide_until_trigger BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.reset_property_hide_until();


--
-- Name: user_photos trg_ensure_one_profile_photo; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ensure_one_profile_photo BEFORE INSERT OR UPDATE ON public.user_photos FOR EACH ROW EXECUTE FUNCTION public.ensure_one_profile_photo();


--
-- Name: helper_modals update_helper_modals_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_helper_modals_updated_at BEFORE UPDATE ON public.helper_modals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: property_swipes update_property_swipes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_property_swipes_updated_at BEFORE UPDATE ON public.property_swipes FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: reviews update_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: availability availability_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: cities cities_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: cities cities_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: contact_verifications contact_verifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_verifications
    ADD CONSTRAINT contact_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: conversations conversations_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: conversations conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: host_subletter_swipes host_subletter_swipes_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.host_subletter_swipes
    ADD CONSTRAINT host_subletter_swipes_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: host_subletter_swipes host_subletter_swipes_subletter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.host_subletter_swipes
    ADD CONSTRAINT host_subletter_swipes_subletter_id_fkey FOREIGN KEY (subletter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: locations locations_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id);


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: properties properties_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.users(id);


--
-- Name: properties properties_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: properties properties_place_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_place_type_id_fkey FOREIGN KEY (place_type_id) REFERENCES public.place_types(id);


--
-- Name: property_amenities property_amenities_amenity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_amenities
    ADD CONSTRAINT property_amenities_amenity_id_fkey FOREIGN KEY (amenity_id) REFERENCES public.amenities(id);


--
-- Name: property_amenities property_amenities_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_amenities
    ADD CONSTRAINT property_amenities_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_dates property_dates_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_dates
    ADD CONSTRAINT property_dates_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_photos property_photos_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_photos
    ADD CONSTRAINT property_photos_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_rules property_rules_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_rules
    ADD CONSTRAINT property_rules_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_rules property_rules_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_rules
    ADD CONSTRAINT property_rules_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.rules(id);


--
-- Name: property_styles property_styles_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_styles
    ADD CONSTRAINT property_styles_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_styles property_styles_style_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_styles
    ADD CONSTRAINT property_styles_style_id_fkey FOREIGN KEY (style_id) REFERENCES public.styles(id);


--
-- Name: property_swipe_history property_swipe_history_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_swipe_history
    ADD CONSTRAINT property_swipe_history_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_swipe_history property_swipe_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_swipe_history
    ADD CONSTRAINT property_swipe_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: property_swipes property_swipes_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_swipes
    ADD CONSTRAINT property_swipes_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_swipes property_swipes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.property_swipes
    ADD CONSTRAINT property_swipes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: states states_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: user_firebase_tokens user_firebase_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_firebase_tokens
    ADD CONSTRAINT user_firebase_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_modal_views user_modal_views_helper_modal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_modal_views
    ADD CONSTRAINT user_modal_views_helper_modal_id_fkey FOREIGN KEY (helper_modal_id) REFERENCES public.helper_modals(id) ON DELETE CASCADE;


--
-- Name: user_modal_views user_modal_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_modal_views
    ADD CONSTRAINT user_modal_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_photos user_photos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_photos
    ADD CONSTRAINT user_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: verification_codes verification_codes_contact_verification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.verification_codes
    ADD CONSTRAINT verification_codes_contact_verification_id_fkey FOREIGN KEY (contact_verification_id) REFERENCES public.contact_verifications(id);


--
-- PostgreSQL database dump complete
--

